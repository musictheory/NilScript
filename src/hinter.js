#!/usr/bin/env node

/*
    hinter.js
    (c) 2014-2015 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

"use strict";

var JSHINT = require("jshint").JSHINT;
var fs     = require("fs");
var os     = require('os');

var WorkerProcessArgument = "_$_HINTER_WORKER_$_"

var child_process = require("child_process");

function Hinter(contents, config, ignore, lineMap, files, cache)
{
    this._contents = contents;
    this._config   = config;
    this._ignore   = ignore;
    this._lineMap  = lineMap;
    this._files    = files;

    this._waitingRequests = [ ];
    this._activeRequests  = 0;

    cache = cache || { };
    this._filenameToHintsMap  = cache.hints  || { };
    this._filenameToMtimesMap = cache.mtimes || { };
}


Hinter.prototype.getCache = function()
{
    return {
        hints:  this._filenameToHintsMap,
        mtimes: this._filenameToMtimesMap
    }
}

Hinter.prototype._setupWorkers = function()
{
    var cpuCount = os.cpus().length;

    if (this._waitingRequests.length > cpuCount) {
        var waiting   = this._waitingRequests;
        var workers   = [ ];
        var available = [ ];
        var that = this;

        var filenameToHintsMap = this._filenameToHintsMap;
        var filenameToMtimesMap = this._filenameToMtimesMap;

        for (var i = 0; i < cpuCount; i++) {
            var child = child_process.fork(__filename, [ WorkerProcessArgument ]);

            child.on("message", function(response) {
                filenameToHintsMap[ response.filename] = response.errors;
                filenameToMtimesMap[response.filename] = response.mtime;
                that._activeRequests--;

                available.push(this);

                process.nextTick(function() {
                    if (waiting.length && available.length) {
                        that._activeRequests++;
                        available.shift().send(waiting.shift());
                    }
                });
            });

            workers.push(child);
            available.push(child);
        }

        this._allWorkers       = workers;
        this._availableWorkers = available;
    }
}

Hinter.prototype._getSortedHints = function()
{
    var files = this._files;
    var filenameToHintsMap = this._filenameToHintsMap;

    var result = [ ];

    for (var i = 0, iLength = files.length; i < iLength; i++) {
        var file  = files[i];
        var hints = filenameToHintsMap[file];

        for (var j = 0, jLength = hints ? hints.length : 0; j < jLength; j++) {
            var hint   = hints[j];
            var reason = hint.reason;
            var error  = new Error(reason);
            
            error.line     = hint.line;
            error.column   = hint.character;
            error.file     = file;
            error.code     = hint.code;
            error.name     = "OJHint";
            error.reason   = reason;
            error.original = hint;

            result.push(error);
        }
    }

    return result;
}


Hinter.prototype.run = function(callback)
{
    var lines        = this._contents.split("\n");
    var config       = this._config;
    var ignore       = this._ignore;

    var filenameToHintsMap  = this._filenameToHintsMap;
    var filenameToMtimesMap = this._filenameToMtimesMap;

    var globals;

    if (!ignore) {
        ignore = [ ];
    }

    // Setup config and globals
    {
        config = config || {};
        config = JSON.parse(JSON.stringify(config));

        config.asi      = true;
        config.laxbreak = true;
        config.laxcomma = true;
        config.newcap   = false;

        if (config.globals) {
            globals = config.globals;
            delete config.globals;
        }

        if (!globals) globals = { };
        globals["$oj_oj"] = true;
    }

    // Split contents into waiting messages
    {
        for (var filename in this._lineMap) {
            var entry = this._lineMap[filename];
            var entryContent = lines.slice(entry.start, entry.end).join("\n");

            var stat     = fs.statSync(filename.toString());
            var mtime    = stat.mtime.getTime();
            var oldMtime = filenameToMtimesMap[filename] || 0;

            if (mtime > oldMtime) {
                this._waitingRequests.push({
                    filename: filename,
                    content:  entryContent,
                    config:   config,
                    ignore:   ignore,
                    globals:  globals,
                    mtime:    mtime
                });
            }
        }
    }

    this._setupWorkers();

    var that = this;

    if (this._allWorkers) {
        while (this._availableWorkers.length && this._waitingRequests.length) {
            this._activeRequests++;
            var request = this._waitingRequests.shift();
            this._availableWorkers.shift().send(request);
        }

        var workers = this._allWorkers;

        var interval = setInterval(function() {
            if (that._waitingRequests.length == 0 && that._activeRequests == 0) {
                try {
                    for (var i = 0; i < workers.length; i++) {
                        workers[i].disconnect();
                    }

                    that._allWorkers = [ ];

                    clearInterval(interval);

                    var sorted = that._getSortedHints();
                    callback(null, sorted);

                } catch (e) {
                    callback(e);
                }
            }
        }, 0);


    } else {
        for (var i = 0; i < this._waitingRequests.length; i++) {
            hint(this._waitingRequests[i], function(response) {
                filenameToHintsMap[ response.filename] = response.errors;
                filenameToMtimesMap[response.filename] = response.mtime;
            });
        }

        var sorted = that._getSortedHints();
        callback(null, sorted);
    }


    return this._errors;
}


function hint(request, callback)
{
    var filename = request.filename.toString();
    var content  = request.content.toString();
    var ignore   = request.ignore;
    var config   = request.config;
    var globals  = request.globals;

    var response = { filename: filename, errors: [ ], mtime: request.mtime };

    if (!JSHINT(content, config, globals)) {
        var inErrors  = JSHINT.errors;
        var outErrors = [ ];

        for (var i = 0, length = inErrors.length; i < length; i++) {
            var inError = inErrors[i];
            if (!inError) continue;

            if (ignore.indexOf(inError.code) >= 0) {
                continue;
            }

            response.errors.push(inError);
        }
    }

    callback(response);
}


if (process.argv[2] == WorkerProcessArgument) {
    process.on("message", function(request) {
        hint(request, function(response) {
            process.send(response);
        });
    });
    process.on("disconnect", function() {
        process.exit(0);
    })
}


module.exports = Hinter;
