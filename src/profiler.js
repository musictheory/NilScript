// Based on v0.x of https://github.com/tomgco/chrome-cpu-profiler
//
// Note: See if this file is still necessary once node 0.12 comes out and
// chrome-cpu-profiler / cpu-profiler can be used directly via npm
//

var profiler = require("cpu-profiler");
var _        = require("lodash");
var fs       = require("fs");

var timings = { };

function profile(item, date)
{
    var data = _.clone(item.topRoot);
    
    followChild(item.topRoot, data);

    return {
        head: data,
        startTime: timings[item.title],
        endTime: date
    };
}


function followChild(source, dest)
{
    dest.url = dest.scriptName.replace(source.rootPath, '')

    if (typeof dest.hitCount === "undefined") {
        dest.hitCount = dest.selfSamplesCount;
    }

    if (!dest.children) {
        dest.children = [];
    }

    if (source.childrenCount > 0) {
        for (var i = 0; i < source.childrenCount; i++) {
            var child = source.getChild(i);
            var newChild = _.clone(child);

            followChild(child, newChild);
            
            dest.children.push(newChild);
        }
    }
}


profile.startProfiling = function(name)
{
    timings[name] = +Date.now() / 1000;
    return profiler.startProfiling(name);
}


profile.stopProfiling = function(name)
{
    var data = profile(profiler.stopProfiling(name), Date.now() / 1000);

    if (timings[name]) {
        delete timings[name];
    }

    return data;
}


module.exports = profile
