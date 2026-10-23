/*
 * Copyright 2015 Telefónica Investigación y Desarrollo, S.A.U
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
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with: [german.torodelvalle@telefonica.com]
 */

/* eslint-disable consistent-return */

const ROOT_PATH = require('app-root-path');
const sthLogger = require('logops');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const sthServerUtils = require(ROOT_PATH + '/lib/server/utils/sthServerUtils');
const sthHeaderValidator = require(ROOT_PATH + '/lib/server/validators/sthHeaderValidator');
const sthGetDataHandler = require(ROOT_PATH + '/lib/server/handlers/sthGetDataHandler');
const sthGetDataHandlerV2 = require(ROOT_PATH + '/lib/server/handlers/sthGetDataHandlerV2');
const sthGetVersionHandler = require(ROOT_PATH + '/lib/server/handlers/sthGetVersionHandler');
const sthNotificationHandler = require(ROOT_PATH + '/lib/server/handlers/sthNotificationHandler');
const sthRemoveDataHandler = require(ROOT_PATH + '/lib/server/handlers/sthRemoveDataHandler');
const sthGetLogLevelHandler = require(ROOT_PATH + '/lib/server/handlers/sthGetLogLevelHandler');
const sthSetLogLevelHandler = require(ROOT_PATH + '/lib/server/handlers/sthSetLogLevelHandler');
const sthNotFoundHandler = require(ROOT_PATH + '/lib/server/handlers/sthNotFoundHandler');
const hapi = require('@hapi/hapi');
const joi = require('joi');

let server;

let attendedRequests = 0;

let processedRequestsWithError = 0;

/**
 * Validation failAction which responds with the detailed validation error (including the message and the
 *  validation source and keys), as hapi 16 did, instead of the generic error hapi 17+ responds with by default
 * @param {Object} request The request
 * @param {Object} h       The hapi response toolkit
 * @param {Error}  error   The detailed validation error
 */
function detailedFailAction(request, h, error) {
    throw error;
}

/**
 * Validation failAction for NGSIv2 routes, which adapts the error response format used by hapi to the one
 *  used in NGSIv2
 * @param {Object} request The request
 * @param {Object} h       The hapi response toolkit
 * @param {Error}  error   The detailed validation error
 * @return {Object} The response, taking over the request lifecycle
 */
function ngsiV2FailAction(request, h, error) {
    return h
        .response({ error: 'BadRequest', description: error.output.payload.message })
        .code(400)
        .takeover();
}

/**
 * Returns the configuration for NGSI handlers
 * @param ngsiVersion NGSI version to use. Anything different from 2 (included undefined) means v1
 * @return {Object} The route options
 */
function getNgsiHandlerConfig(ngsiVersion) {
    const aggList = ['min', 'max', 'sum', 'sum2', 'occur', 'all'];
    const joinedAggList = '(' + aggList.join('|') + ')';
    const aggRegex = new RegExp('^' + joinedAggList + '(,' + joinedAggList + ')*$');

    const queryKeys = {
        // prettier-ignore
        lastN: joi.number().integer().greater(-1).optional(),
        // prettier-ignore
        hLimit: joi.number().integer().greater(-1).optional(),
        // prettier-ignore
        hOffset: joi.number().integer().greater(-1).optional(),
        // prettier-ignore
        aggrMethod: joi.string().regex(aggRegex).optional(),
        // prettier-ignore
        aggrPeriod: joi.string().required().valid(
            'month', 'day', 'hour', 'minute', 'second').optional(),
        dateFrom: joi.date().optional(),
        dateTo: joi.date().optional(),
        filetype: joi.string().optional(),
        count: joi.boolean().optional()
    };

    const config = {
        validate: {
            headers: sthHeaderValidator
        }
    };

    if (ngsiVersion === 2) {
        config.validate.failAction = ngsiV2FailAction;

        // In NGSIv2 type query param is mandatory
        queryKeys.type = joi.string().required();
    }

    config.validate.query = joi.object(queryKeys);

    return config;
}

/**
 * Returns the server options
 * @param  {String} host The host
 * @param  {Number} port The port
 * @param  {String} address The IP address to listen on
 * @return {Object} The options to create the hapi server with
 */
function getServerOptions(host, port, address) {
    const routes = {
        response: {
            // hapi 16 responded with 200 - OK when no payload was provided, hapi 17+ responds with 204 by default
            emptyStatusCode: 200
        },
        validate: {
            failAction: detailedFailAction
        }
    };

    if (sthConfig.corsEnabled) {
        sthLogger.info('CORS is enabled');
        routes.cors = {
            origin: sthConfig.corsOptions.origin,
            headers: sthConfig.corsOptions.headers,
            additionalHeaders: sthConfig.corsOptions.additionalHeaders,
            credentials: sthConfig.corsOptions.credentials
        };
    } else {
        sthLogger.info('CORS is disabled');
    }

    return {
        host,
        address,
        port,
        routes
    };
}

/**
 * Returns the routes served by the STH server
 * @return {Array} The routes
 */
function getRoutes() {
    return [
        {
            method: 'GET',
            path: '/STH/v1/contextEntities/type/{entityType}/id/{entityId}/attributes/{attrName}',
            handler: sthServerUtils.toHapiHandler(sthGetDataHandler),
            options: getNgsiHandlerConfig(1)
        },
        {
            method: 'GET',
            path: '/STH/v2/entities/{entityId}/attrs/{attrName}',
            handler: sthServerUtils.toHapiHandler(sthGetDataHandlerV2),
            options: getNgsiHandlerConfig(2)
        },
        {
            method: 'GET',
            path: '/version',
            handler: sthServerUtils.toHapiHandler(sthGetVersionHandler)
        },
        {
            method: 'POST',
            path: '/notify',
            handler: sthServerUtils.toHapiHandler(sthNotificationHandler),
            options: {
                validate: {
                    headers: sthHeaderValidator
                }
            }
        },
        {
            method: 'DELETE',
            path: '/STH/v1/contextEntities',
            handler: sthServerUtils.toHapiHandler(sthRemoveDataHandler),
            options: {
                validate: {
                    headers: sthHeaderValidator
                }
            }
        },
        {
            method: 'DELETE',
            path: '/STH/v1/contextEntities/type/{entityType}/id/{entityId}',
            handler: sthServerUtils.toHapiHandler(sthRemoveDataHandler),
            options: {
                validate: {
                    headers: sthHeaderValidator
                }
            }
        },
        {
            method: 'DELETE',
            path: '/STH/v1/contextEntities/type/{entityType}/id/{entityId}/attributes/{attrName}',
            handler: sthServerUtils.toHapiHandler(sthRemoveDataHandler),
            options: {
                validate: {
                    headers: sthHeaderValidator
                }
            }
        },
        {
            method: 'PUT',
            path: '/admin/log',
            handler: sthServerUtils.toHapiHandler(sthSetLogLevelHandler),
            options: {
                validate: {
                    query: joi.object({
                        // prettier-ignore
                        level: joi.string().insensitive().valid('FATAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG').required()
                    })
                }
            }
        },
        {
            method: 'GET',
            path: '/admin/log',
            handler: sthServerUtils.toHapiHandler(sthGetLogLevelHandler)
        },
        {
            method: '*',
            path: '/{p*}',
            handler: sthServerUtils.toHapiHandler(sthNotFoundHandler)
        }
    ];
}

/**
 * Logs the request internal events tagged as errors and updates the KPIs accordingly
 * @param {Object} request The request
 * @param {Object} event   The request event
 * @param {Object} tags    The tags of the event as an object
 */
function onRequestInternalEvent(request, event, tags) {
    if (tags.error) {
        processedRequestsWithError++;
        const message =
            request.method.toUpperCase() +
            ' ' +
            sthServerUtils.getRequestPath(request) +
            ', event=' +
            JSON.stringify(event);
        if (tags.auth || tags.handler || tags.state || tags.payload || tags.validation) {
            sthLogger.warn(sthServerUtils.getContext(request), message);
        } else {
            sthLogger.error(sthServerUtils.getContext(request), message);
        }
    }
}

/**
 * Effectively starts and configures the hapi server
 * @param  {String}   host     The host
 * @param  {Number}   port     The port
 * @return {Promise} A promise resolved with the started server
 */
async function doStartServer(host, port) {
    const address = await sthServerUtils.getListenAddress(host);
    server = hapi.server(getServerOptions(host, port, address));

    server.events.on('log', function(event, tags) {
        if (tags.load) {
            sthLogger.warn(sthConfig.LOGGING_CONTEXT.SERVER_LOG, 'event=' + JSON.stringify(event));
        }
    });

    server.events.on({ name: 'request', channels: 'internal' }, onRequestInternalEvent);

    server.events.on('response', function() {
        attendedRequests++;
    });

    server.route(getRoutes());

    await server.start();
    return server;
}

/**
 * Calls the callback, if any, out of the promise chain so the exceptions it may throw are not swallowed
 * @param {Promise}  promise  The promise
 * @param {Function} callback The callback, called with the error or with null and the resolved value
 * @return {Promise} The promise
 */
function callbackify(promise, callback) {
    if (callback) {
        promise.then(
            function(result) {
                process.nextTick(callback, null, result);
            },
            function(err) {
                process.nextTick(callback, err);
            }
        );
    }
    return promise;
}

/**
 * Starts the server asynchronously
 * @param {String} host The STH server host
 * @param {String} port The STH server port
 * @param {Function} callback Optional callback function to notify the result of the operation
 * @return {Promise} A promise resolved with the started server
 */
function startServer(host, port, callback) {
    if (server && server.info && server.info.started) {
        sthLogger.info(sthConfig.LOGGING_CONTEXT.SERVER_STOP, 'STH server already started');
        return callbackify(Promise.resolve(server), callback);
    }
    return callbackify(doStartServer(host, port), callback);
}

/**
 * Effectively stops the hapi server, if running
 * @return {Promise} A promise resolved once the server is stopped
 */
async function doStopServer() {
    sthLogger.info(sthConfig.LOGGING_CONTEXT.SERVER_STOP, 'Stopping the STH server...');
    if (server && server.info && server.info.started) {
        await server.stop();
        // Server successfully stopped
        sthLogger.info(sthConfig.LOGGING_CONTEXT.SERVER_STOP, 'hapi server successfully stopped');
    } else {
        sthLogger.info(sthConfig.LOGGING_CONTEXT.SERVER_STOP, 'No hapi server running');
    }
}

/**
 * Stops the server asynchronously
 * @param {Function} callback Optional callback function to notify the result
 *  of the operation
 * @return {Promise} A promise resolved once the server is stopped
 */
function stopServer(callback) {
    return callbackify(doStopServer(), callback);
}

/**
 * Returns the server KPIs
 * @return {{attendedRequests: number}}
 */
function getKPIs() {
    return {
        attendedRequests
    };
}

/**
 * Returns the counter for processed requests with error
 * @return {{processedRequestsWithError: number}}
 */
function getProcessedRequestsWithErrorCount() {
    return {
        processedRequestsWithError
    };
}

/**
 * Resets the server KPIs
 */
function resetKPIs() {
    attendedRequests = 0;
}

/**
 * Resets the counter for processed requests with error
 */
function resetProcessedRequestsWithErrorCount() {
    processedRequestsWithError = 0;
}

module.exports = {
    get server() {
        return server;
    },
    startServer,
    stopServer,
    getKPIs,
    getProcessedRequestsWithErrorCount,
    resetKPIs,
    resetProcessedRequestsWithErrorCount
};
