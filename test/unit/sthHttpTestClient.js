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
 * It replaces the deprecated request module, which used to be the HTTP client of the tests. request() keeps the
 *  options and callback signature of that module, so that the tests using it did not need to be rewritten.
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
            headers: getHeaders(options.headers, payload),
            // A new connection per request, closed after the response, since idle keep-alive connections
            //  delay the stop of the hapi server
            agent: false
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

/**
 * Translates the options of the deprecated request module used by the tests into the options of sendRequest()
 * @param {Object} options It is an object including the following properties:
 *  - {string} uri The absolute URL of the request
 *  - {string} method The HTTP method
 *  - {Object} headers The request headers (optional)
 *  - {Object} body The request body (optional)
 *  - {boolean} json If true, the Accept: application/json header is added if no Accept header is set (optional)
 *  - {number} timeout Milliseconds to wait for the complete response (optional)
 * @return {Object} The options of sendRequest()
 */
function toSendRequestOptions(options) {
    const url = new URL(options.uri);
    const headers = Object.assign({}, options.headers);
    const hasAcceptHeader = Object.keys(headers).some(function(name) {
        return name.toLowerCase() === 'accept';
    });
    if (options.json && !hasAcceptHeader) {
        headers.Accept = 'application/json';
    }
    return {
        host: url.hostname,
        port: Number(url.port),
        method: options.method,
        path: url.pathname + url.search,
        headers,
        body: options.body,
        timeout: options.timeout
    };
}

/**
 * Returns the response body as the deprecated request module did
 * @param {String} body The response body as a string
 * @param {boolean} json If true, the body is parsed as JSON. An empty body is returned as undefined and a body which
 *  is not valid JSON is returned as is
 * @return {Object|String|undefined} The response body
 */
function parseResponseBody(body, json) {
    if (!json) {
        return body;
    }
    if (body === '') {
        return undefined;
    }
    try {
        return JSON.parse(body);
    } catch (e) {
        return body;
    }
}

/**
 * Sends an HTTP request with the options and callback signature of the deprecated request module
 * @param {Object} options The options described in toSendRequestOptions()
 * @param {Function} callback Callback called exactly once with the error, the response (including the statusCode,
 *  the headers and the body) and the body, which is parsed as JSON if the json option is true
 */
function request(options, callback) {
    sendRequest(toSendRequestOptions(options), function(err, response) {
        if (err) {
            return callback(err);
        }
        const body = parseResponseBody(response.body, options.json);
        return callback(null, Object.assign({}, response, { body }), body);
    });
}

/**
 * Returns a sendRequest() callback which runs the provided assertions and notifies their result to mocha
 *  through the done() function of the test case. Assertion errors are passed to done() instead of being
 *  thrown from an asynchronous callback, where they would reach the uncaughtException handler registered
 *  by lib/sth.js, which stops the server and exits the test process
 * @param {Function} done The done() function of the mocha test case
 * @param {Function} assertions Function called with the error and the response of the request
 * @return {Function} The callback to pass to sendRequest()
 */
function assertResponse(done, assertions) {
    return function(err, response) {
        try {
            assertions(err, response);
        } catch (assertionError) {
            return done(assertionError);
        }
        return done();
    };
}

module.exports = {
    sendRequest,
    toSendRequestOptions,
    parseResponseBody,
    request,
    assertResponse
};
