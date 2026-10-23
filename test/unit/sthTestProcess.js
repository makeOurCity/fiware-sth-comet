/*
 * Copyright 2026 makeOurCity fork contributors
 *
 * This file is part of the Short Time Historic (STH) component
 *
 * STH is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * STH is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with STH.
 * If not, see http://www.gnu.org/licenses/.
 */

/*
 * Runs the STH application (lib/sth.js) in a child process, as it is run in production, for the tests which need
 *  a configuration different from the one of the test process (the configuration is read once when
 *  lib/configuration/sthConfiguration.js is required) or which check its startup and shutdown.
 */

/* eslint-disable consistent-return */

const ROOT_PATH = require('app-root-path');
const childProcess = require('child_process');
const path = require('path');

const STARTED_MESSAGE = 'Server started at';
const DEFAULT_TIMEOUT = 10000;

/**
 * Spawns the STH application
 * @param {Object} env The environment variables to add to the ones of the test process
 * @return {Object} The child process, including an output property with its stdout and stderr contents and an
 *  exitInfo property with the exit code and signal once it exits
 */
function spawnSth(env) {
    const child = childProcess.spawn(process.execPath, [path.join(String(ROOT_PATH), 'lib', 'sth.js')], {
        cwd: String(ROOT_PATH),
        env: Object.assign({}, process.env, { LOGOPS_LEVEL: 'INFO', LOGOPS_FORMAT: 'pipe' }, env)
    });
    child.output = '';
    child.exitInfo = null;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', function(chunk) {
        child.output += chunk;
    });
    child.stderr.on('data', function(chunk) {
        child.output += chunk;
    });
    child.on('exit', function(code, signal) {
        child.exitInfo = { code, signal };
    });
    return child;
}

/**
 * Waits until the child process writes a text or exits, whatever happens first
 * @param {Object} child The child process returned by spawnSth()
 * @param {String} text The text to wait for
 * @param {Number} timeout Milliseconds to wait at most
 * @param {Function} callback Called with an error if the text was not written before the process exited or the
 *  timeout expired
 */
function waitForOutput(child, text, timeout, callback) {
    const timer = setTimeout(function() {
        finish(new Error('The STH process did not write "' + text + '" within ' + timeout + 'ms:\n' + child.output));
    }, timeout);

    function check() {
        if (child.output.indexOf(text) !== -1) {
            return finish();
        }
        if (child.exitInfo) {
            return finish(new Error('The STH process exited before writing "' + text + '":\n' + child.output));
        }
    }

    function finish(err) {
        clearTimeout(timer);
        child.stdout.removeListener('data', check);
        child.stderr.removeListener('data', check);
        child.removeListener('exit', check);
        callback(err);
    }

    child.stdout.on('data', check);
    child.stderr.on('data', check);
    child.on('exit', check);
    check();
}

/**
 * Waits until the child process exits
 * @param {Object} child The child process returned by spawnSth()
 * @param {Number} timeout Milliseconds to wait at most
 * @param {Function} callback Called with an error if the timeout expired or with the exit code and signal
 */
function waitForExit(child, timeout, callback) {
    if (child.exitInfo) {
        return process.nextTick(callback.bind(null, null, child.exitInfo));
    }
    const timer = setTimeout(function() {
        child.removeListener('exit', onExit);
        callback(new Error('The STH process did not exit within ' + timeout + 'ms:\n' + child.output));
    }, timeout);

    function onExit() {
        clearTimeout(timer);
        callback(null, child.exitInfo);
    }

    child.once('exit', onExit);
}

/**
 * Starts the STH application and waits until its server is started
 * @param {Object} env The environment variables to add to the ones of the test process
 * @param {Function} callback Called with an error or with the child process once the server is started
 */
function startSth(env, callback) {
    const child = spawnSth(env);
    waitForOutput(child, STARTED_MESSAGE, DEFAULT_TIMEOUT, function(err) {
        if (err) {
            child.kill('SIGKILL');
            return callback(err);
        }
        return callback(null, child);
    });
}

/**
 * Stops the STH application sending it a signal and waits until it exits
 * @param {Object} child The child process returned by spawnSth() or startSth()
 * @param {String} signal The signal to send (SIGTERM by default)
 * @param {Function} callback Called with an error or with the exit code and signal
 */
function stopSth(child, signal, callback) {
    if (!child || child.exitInfo) {
        return process.nextTick(callback.bind(null, null, child && child.exitInfo));
    }
    child.kill(signal || 'SIGTERM');
    waitForExit(child, DEFAULT_TIMEOUT, function(err, exitInfo) {
        if (err) {
            child.kill('SIGKILL');
        }
        callback(err, exitInfo);
    });
}

module.exports = {
    spawnSth,
    startSth,
    stopSth,
    waitForExit,
    waitForOutput
};
