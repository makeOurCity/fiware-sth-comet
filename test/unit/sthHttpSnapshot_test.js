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
 * Snapshot (characterization) tests of the HTTP API: notifications, raw and aggregated data retrieval using the
 *  NGSIv1 and NGSIv2 APIs, CSV download and data removal.
 *
 * The requests are sent in order as a scenario: notifications first, then retrievals and finally removals, so the
 *  tests of this file depend on the previous ones of the same file (but not on other files). The status code, the
 *  relevant headers and the body of each response are compared with test/unit/snapshots/sthHttpSnapshot.json,
 *  recorded with the code previous to the dependency upgrades on Node.js 14. See test/unit/sthSnapshot.js to record
 *  them again.
 *
 * The data is stored in its own service so that the removal of all the data does not affect other tests.
 */

const ROOT_PATH = require('app-root-path');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const sthDatabase = require(ROOT_PATH + '/lib/database/sthDatabase');
const sthDatabaseNaming = require(ROOT_PATH + '/lib/database/model/sthDatabaseNaming');
const sthServer = require(ROOT_PATH + '/lib/server/sthServer');
const sthConfigurationPin = require(ROOT_PATH + '/test/unit/sthConfigurationPin');
const sthHttpTestClient = require(ROOT_PATH + '/test/unit/sthHttpTestClient');
const sthSnapshot = require(ROOT_PATH + '/test/unit/sthSnapshot');
const path = require('path');

const SERVICE = 'sthsnapshot';
const SERVICE_PATH = '/snapshot';
const ENTITY_TYPE = 'T';
const T1 = '2026-10-23T10:15:30.000Z';
const T2 = '2026-10-23T10:16:30.000Z';
const T3 = '2026-10-23T11:00:00.000Z';
// Attribute name including non ASCII characters to check the encoding of the CSV file name
const UNICODE_ATTR_NAME = '温度';

/**
 * Returns an NGSIv1 notification as sent by the Orion Context Broker
 * @param {String} entityId The entity id
 * @param {Array} attributes The attributes of the notified entity
 * @return {Object} The notification body
 */
function getNotification(entityId, attributes) {
    return {
        subscriptionId: '1234567890ABCDF123456789',
        originator: 'orion.contextBroker.instance',
        contextResponses: [
            {
                contextElement: { attributes, type: ENTITY_TYPE, isPattern: 'false', id: entityId },
                statusCode: { code: '200', reasonPhrase: 'OK' }
            }
        ]
    };
}

/**
 * Returns an attribute of a notification including the TimeInstant metadata, so that the stored data does not
 *  depend on the time the test is run
 * @param {String} name The attribute name
 * @param {String} type The attribute type
 * @param {String} value The attribute value
 * @param {String} timeInstant The value of the TimeInstant metadata
 * @return {Object} The attribute
 */
function getAttribute(name, type, value, timeInstant) {
    return { name, type, value, metadatas: [{ name: 'TimeInstant', type: 'ISO8601', value: timeInstant }] };
}

/**
 * Returns the path to get data using the NGSIv1 API
 * @param {String} entityId The entity id
 * @param {String} attrName The attribute name
 * @param {String} query The query string
 * @return {String} The path
 */
function getV1Path(entityId, attrName, query) {
    return (
        '/STH/v1/contextEntities/type/' +
        ENTITY_TYPE +
        '/id/' +
        entityId +
        '/attributes/' +
        encodeURIComponent(attrName) +
        '?' +
        query
    );
}

/**
 * Returns the path to get data using the NGSIv2 API
 * @param {String} entityId The entity id
 * @param {String} attrName The attribute name
 * @param {String} query The query string, without the type
 * @return {String} The path
 */
function getV2Path(entityId, attrName, query) {
    return '/STH/v2/entities/' + entityId + '/attrs/' + attrName + '?type=' + ENTITY_TYPE + '&' + query;
}

/**
 * Returns the steps of the scenario. Each step is a request whose response is compared with its snapshot
 * @return {Object} The steps, grouped by the kind of request
 */
function getSteps() {
    const notify = function (entityId, attributes) {
        return { method: 'POST', path: '/notify', body: getNotification(entityId, attributes) };
    };
    const get = function (requestPath) {
        return { method: 'GET', path: requestPath };
    };
    const del = function (requestPath) {
        return { method: 'DELETE', path: requestPath };
    };
    const temperature = getAttribute.bind(null, 'temperature', 'Number');
    const status = getAttribute.bind(null, 'status', 'Text');

    return {
        'POST /notify': {
            notifyNew: notify('E1', [temperature('20', T1), status('ok', T1)]),
            notifySecondValue: notify('E1', [temperature('25', T2), status('ng', T2)]),
            notifyThirdValue: notify('E1', [temperature('30', T3), status('ok', T3)]),
            notifyDuplicate: notify('E1', [temperature('30', T3)]),
            notifyValueUpdate: notify('E1', [temperature('22', T1), status('ng', T1)]),
            notifySecondEntity: notify('E2', [temperature('5', T1)]),
            notifyUnicodeAttribute: notify('E3', [getAttribute(UNICODE_ATTR_NAME, 'Number', '12.5', T1)])
        },
        'GET NGSIv1 raw data': {
            v1Raw: get(getV1Path('E1', 'temperature', 'lastN=10')),
            v1RawWithoutCorrelator: Object.assign(get(getV1Path('E1', 'temperature', 'lastN=1')), {
                correlator: false
            }),
            v1RawLastNCount: get(getV1Path('E1', 'temperature', 'lastN=2&count=true')),
            v1RawPagination: get(getV1Path('E1', 'temperature', 'hLimit=2&hOffset=1&count=true')),
            v1RawDateRange: get(getV1Path('E1', 'temperature', 'dateFrom=' + T1 + '&dateTo=' + T2 + '&lastN=10')),
            v1RawPaginationDateRange: get(
                getV1Path('E1', 'temperature', 'dateFrom=' + T2 + '&hLimit=10&hOffset=0&count=true')
            ),
            v1RawLastN0: get(getV1Path('E1', 'temperature', 'lastN=0')),
            v1RawText: get(getV1Path('E1', 'status', 'lastN=10')),
            v1RawUnknownEntity: get(getV1Path('NOPE', 'temperature', 'lastN=10&count=true'))
        },
        'GET NGSIv1 aggregated data': {
            v1AggrSumMinute: get(getV1Path('E1', 'temperature', 'aggrMethod=sum&aggrPeriod=minute')),
            v1AggrSum2Minute: get(getV1Path('E1', 'temperature', 'aggrMethod=sum2&aggrPeriod=minute')),
            v1AggrMaxHourDateRange: get(
                getV1Path('E1', 'temperature', 'aggrMethod=max&aggrPeriod=hour&dateFrom=' + T1 + '&dateTo=' + T2)
            ),
            v1AggrMinDay: get(getV1Path('E1', 'temperature', 'aggrMethod=min&aggrPeriod=day')),
            v1AggrMinMaxHour: get(getV1Path('E1', 'temperature', 'aggrMethod=min,max&aggrPeriod=hour')),
            v1AggrAllHour: get(getV1Path('E1', 'temperature', 'aggrMethod=all&aggrPeriod=hour')),
            v1AggrSumSecond: get(getV1Path('E1', 'temperature', 'aggrMethod=sum&aggrPeriod=second')),
            v1AggrSumMonth: get(getV1Path('E1', 'temperature', 'aggrMethod=sum&aggrPeriod=month')),
            v1AggrOccurHour: get(getV1Path('E1', 'status', 'aggrMethod=occur&aggrPeriod=hour')),
            v1AggrUnknownEntity: get(getV1Path('NOPE', 'temperature', 'aggrMethod=sum&aggrPeriod=hour'))
        },
        'GET NGSIv2 data': {
            v2Raw: get(getV2Path('E1', 'temperature', 'lastN=10')),
            v2RawCount: get(getV2Path('E1', 'temperature', 'lastN=10&count=true')),
            v2RawPagination: get(getV2Path('E1', 'temperature', 'hLimit=1&hOffset=0')),
            v2RawDateRange: get(getV2Path('E1', 'temperature', 'dateFrom=' + T2 + '&lastN=10')),
            v2AggrSumHour: get(getV2Path('E1', 'temperature', 'aggrMethod=sum&aggrPeriod=hour')),
            v2AggrAllMinute: get(getV2Path('E1', 'temperature', 'aggrMethod=all&aggrPeriod=minute')),
            v2AggrOccurMinute: get(getV2Path('E1', 'status', 'aggrMethod=occur&aggrPeriod=minute')),
            v2RawUnknownEntity: get(getV2Path('NOPE', 'temperature', 'lastN=10'))
        },
        'GET CSV data': {
            csvLastN: get(getV1Path('E1', 'temperature', 'lastN=10&filetype=csv')),
            csvPagination: get(getV1Path('E1', 'temperature', 'hLimit=2&hOffset=0&filetype=csv')),
            csvOnlyFiletype: get(getV1Path('E1', 'status', 'filetype=csv')),
            csvUnicodeAttribute: get(getV1Path('E3', UNICODE_ATTR_NAME, 'lastN=10&filetype=csv')),
            csvUnknownEntity: get(getV1Path('NOPE', 'temperature', 'lastN=10&filetype=csv'))
        },
        DELETE: {
            deleteAttribute: del('/STH/v1/contextEntities/type/T/id/E1/attributes/temperature'),
            afterDeleteAttributeRaw: get(getV1Path('E1', 'temperature', 'lastN=10')),
            afterDeleteAttributeAggregated: get(getV1Path('E1', 'temperature', 'aggrMethod=sum&aggrPeriod=hour')),
            afterDeleteAttributeOtherAttributeKept: get(getV1Path('E1', 'status', 'lastN=10')),
            deleteEntity: del('/STH/v1/contextEntities/type/T/id/E1'),
            afterDeleteEntity: get(getV1Path('E1', 'status', 'lastN=10')),
            afterDeleteEntityOtherEntityKept: get(getV1Path('E2', 'temperature', 'lastN=10')),
            deleteNonExistentEntity: del('/STH/v1/contextEntities/type/T/id/NOPE'),
            deleteNonExistentAttribute: del('/STH/v1/contextEntities/type/T/id/NOPE/attributes/x'),
            deleteAll: del('/STH/v1/contextEntities'),
            afterDeleteAll: get(getV1Path('E2', 'temperature', 'lastN=10')),
            deleteAllAgain: del('/STH/v1/contextEntities')
        }
    };
}

/**
 * Sends the request of a step
 * @param {String} name The step name, used as correlator
 * @param {Object} step The step
 * @param {Function} callback The callback, called with the error or the response
 */
function sendStep(name, step, callback) {
    const headers = { 'Fiware-Service': SERVICE, 'Fiware-ServicePath': SERVICE_PATH };
    if (step.correlator !== false) {
        headers['Fiware-Correlator'] = 'snapshot-' + name;
    }
    sthHttpTestClient.sendRequest({ method: step.method, path: step.path, headers, body: step.body }, callback);
}

/**
 * Removes all the data of the test service using the API. Errors are ignored since this is only a best effort
 *  clean up: the snapshots detect any data left
 * @param {Function} callback The callback
 */
function removeAllData(callback) {
    sendStep('cleanUp', { method: 'DELETE', path: '/STH/v1/contextEntities' }, function () {
        callback();
    });
}

describe('HTTP API snapshots', function () {
    let restoreConfiguration;

    before(function () {
        // The responses depend on the data model and the naming of the collections
        restoreConfiguration = sthConfigurationPin.pinInitialConfiguration();
    });

    after(function () {
        restoreConfiguration();
    });

    const matcher = sthSnapshot.createMatcher(path.join(__dirname, 'snapshots', 'sthHttpSnapshot.json'));
    const steps = getSteps();
    let originalTZ;

    before(function (done) {
        // The CSV files include the dates formatted with the time zone of the server
        originalTZ = process.env.TZ;
        process.env.TZ = 'UTC';
        sthDatabase.connect(
            {
                authentication: sthConfig.DB_AUTHENTICATION,
                dbURI: sthConfig.DB_URI,
                replicaSet: sthConfig.REPLICA_SET,
                database: sthDatabaseNaming.getDatabaseName(sthConfig.DEFAULT_SERVICE),
                poolSize: sthConfig.POOL_SIZE
            },
            function (err) {
                if (err) {
                    return done(err);
                }
                return sthServer.startServer(sthConfig.STH_HOST, sthConfig.STH_PORT, function (err) {
                    if (err) {
                        return done(err);
                    }
                    return removeAllData(done);
                });
            }
        );
    });

    after(function (done) {
        matcher.save();
        removeAllData(function () {
            sthServer.stopServer(function () {
                sthDatabase.closeConnection(function () {
                    if (originalTZ === undefined) {
                        delete process.env.TZ;
                    } else {
                        process.env.TZ = originalTZ;
                    }
                    done();
                });
            });
        });
    });

    Object.keys(steps).forEach(function (group) {
        describe(group, function () {
            Object.keys(steps[group]).forEach(function (name) {
                const step = steps[group][name];
                it(name + ': ' + step.method + ' ' + step.path, function (done) {
                    sendStep(
                        name,
                        step,
                        sthHttpTestClient.assertResponse(done, function (err, response) {
                            matcher.match(name, sthSnapshot.toSnapshot(step, err, response));
                        })
                    );
                });
            });
        });
    });
});
