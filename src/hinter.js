#!/usr/bin/env node

/*
    hinter.js
    (c) 2014 musictheory.net, LLC
    MIT license, http://www.opensource.org/licenses/mit-license.php
*/

var JSHINT = require("jshint").JSHINT;
var fs     = require("fs");
var os     = require('os');

var WorkerProcessArgument = "_$_HINTER_WORKER_$_"

var child_process = require("child_process");

function Hinter(contents, config, ignore, lineMap)
{
    this._contents = contents;
    this._config   = config;
    this._ignore   = ignore;
    this._lineMap  = lineMap;

    this._waitingRequests = [ ];
    this._activeRequests  = 0;

    this._results = { };

    this._setupWorkers();
}


Hinter.prototype._setupWorkers = function()
{
    var cpuCount = os.cpus().length;

    if (1 || this._lineMap.length > cpuCount) {
        var waiting   = this._waitingRequests;
        var results   = this._results;
        var workers   = [ ];
        var available = [ ];
        var that = this;

        for (var i = 0; i < cpuCount; i++) {
            var child = child_process.fork(__filename, [ WorkerProcessArgument ]);

            child.on("message", function(response) {
                results[response.filename] = response.errors;
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


Hinter.prototype.run = function(callback)
{
    var lines  = this._contents.split("\n");
    var config = this._config;
    var ignore = this._ignore;
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
        for (var key in this._lineMap) {
            var entry = this._lineMap[key];
            var entryContent = lines.slice(entry.start, entry.end).join("\n");

            this._waitingRequests.push({
                filename: key,
                content:  entryContent,
                config:   config,
                ignore:   ignore,
                globals:  globals
            });

        }
    }

    if (this._allWorkers) {
        while (this._availableWorkers.length && this._waitingRequests.length) {
            this._activeRequests++;
            var request = this._waitingRequests.shift();
            this._availableWorkers.shift().send(request);
        }

    } else {
        for (var i = 0; i < this._waitingRequests.length; i++) {
            hint(this._waitingRequests[i], function(response) {
                this._results[response.filename] = response.errors;
            });
        }
    }

    var that = this;
    var workers = this._allWorkers;

    var interval = setInterval(function() {
        if (that._waitingRequests.length == 0 && that._activeRequests == 0) {
            for (var i = 0; i < workers.length; i++) {
                workers[i].disconnect();
            }
            that._allWorkers = [ ];

            clearInterval(interval);

            callback(that._results);
        }
    }, 0);

    return this._errors;
}


function hint(request, callback)
{
    var filename = request.filename.toString();
    var content  = request.content.toString();
    var ignore   = request.ignore;
    var config   = request.config;
    var globals  = request.globals;

    var response = { filename: filename, errors: [ ] };

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


module.exports = { Hinter: Hinter };
