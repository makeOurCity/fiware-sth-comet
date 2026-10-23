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
 * Minimal HTTP client for the E2E tests based on the Node.js built-in http module.
 *
 * Unlike the deprecated request module, it fails fast with an ETIMEDOUT error when the server does not
 *  respond in time and guarantees that the callback is called exactly once. This way, a request which
 *  never gets a response (as it happens with hapi 16 on Node.js 16+) only makes the test sending it fail,
 *  instead of calling back later on and breaking unrelated tests.
 */

const ROOT_PATH = require('app-root-path');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const http = require('http');

const DEFAULT_TIMEOUT = 2000;

/**
 * Returns the request headers, adding the JSON content headers if a body is sent
 * @param {Object} headers The headers provided by the caller, if any
 * @param {String} payload The serialized body, if any
 * @return {Object} The headers to send
 */
function getHeaders(headers, payload) {
    const result = Object.assign({}, headers);
    if (payload !== undefined) {
        result['Content-Type'] = result['Content-Type'] || 'application/json';
        result['Content-Length'] = Buffer.byteLength(payload);
    }
    return result;
}

/**
 * Sends an HTTP request and collects the complete response
 * @param {Object} options It is an object including the following properties:
 *  - {string} method The HTTP method
 *  - {string} path The path, including the query string if any
 *  - {Object} headers The request headers (optional)
 *  - {Object} body The request body, sent serialized as JSON (optional)
 *  - {string} host The host (optional, the STH host by default)
 *  - {number} port The port (optional, the STH port by default)
 *  - {number} timeout Milliseconds to wait for the complete response (optional, 2000 by default)
 * @param {Function} callback Callback called exactly once with an error or with the response as an object
 *  including the statusCode, the headers and the body as a string
 */
function sendRequest(options, callback) {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    let isFinished = false;

    function finish(err, response) {
        if (isFinished) {
            return;
        }
        isFinished = true;
        clearTimeout(timer);
        callback(err, response);
    }

    const req = http.request(
        {
            host: options.host || sthConfig.STH_HOST,
            port: options.port || sthConfig.STH_PORT,
            method: options.method,
            path: options.path,
            headers: getHeaders(options.headers, payload)
        },
        function(res) {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                finish(null, { statusCode: res.statusCode, headers: res.headers, body });
            });
            res.on('error', finish);
        }
    );

    const timer = setTimeout(function() {
        const err = new Error(
            'No complete response received within ' + timeout + 'ms for ' + options.method + ' ' + options.path
        );
        err.code = 'ETIMEDOUT';
        finish(err);
        req.destroy();
    }, timeout);

    req.on('error', finish);
    req.end(payload);
}

module.exports = {
    sendRequest
};
