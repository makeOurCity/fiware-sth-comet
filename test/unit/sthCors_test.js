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
 * Snapshot (characterization) tests of the CORS support, with CORS enabled (CORS_ENABLED=true) and disabled (the
 *  default configuration).
 *
 * Since the configuration is read once when lib/configuration/sthConfiguration.js is required, the STH application
 *  is run in a child process for each configuration. The responses, including the access-control-* headers, are
 *  compared with test/unit/snapshots/sthCors.json (see test/unit/sthSnapshot.js to record them again).
 */

const ROOT_PATH = require('app-root-path');
const sthHttpTestClient = require(ROOT_PATH + '/test/unit/sthHttpTestClient');
const sthSnapshot = require(ROOT_PATH + '/test/unit/sthSnapshot');
const sthTestProcess = require(ROOT_PATH + '/test/unit/sthTestProcess');
const path = require('path');

const PORT = 8668;
const ORIGIN = 'http://dashboard.example.com';
const DATA_PATH = '/STH/v1/contextEntities/type/T/id/E1/attributes/temperature?lastN=10';
const SERVICE_HEADERS = { 'Fiware-Service': 'sthcors', 'Fiware-ServicePath': '/cors' };

/**
 * Returns the requests whose responses are compared with their snapshots
 * @return {Object} The requests by name
 */
function getRequests() {
    return {
        preflight: {
            method: 'OPTIONS',
            path: DATA_PATH,
            headers: {
                Origin: ORIGIN,
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'fiware-service,fiware-servicepath'
            }
        },
        preflightNotAllowedHeader: {
            method: 'OPTIONS',
            path: DATA_PATH,
            headers: {
                Origin: ORIGIN,
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'x-not-allowed'
            }
        },
        preflightDelete: {
            method: 'OPTIONS',
            path: '/STH/v1/contextEntities/type/T/id/E1',
            headers: {
                Origin: ORIGIN,
                'Access-Control-Request-Method': 'DELETE',
                'Access-Control-Request-Headers': 'fiware-service,fiware-servicepath'
            }
        },
        getWithOrigin: {
            method: 'GET',
            path: DATA_PATH,
            headers: Object.assign({ Origin: ORIGIN }, SERVICE_HEADERS)
        },
        getWithoutOrigin: { method: 'GET', path: DATA_PATH, headers: SERVICE_HEADERS },
        logLevelWithOrigin: { method: 'GET', path: '/admin/log', headers: { Origin: ORIGIN } }
    };
}

/**
 * Defines the tests for a CORS configuration
 * @param {Object} matcher The snapshot matcher
 * @param {String} configuration The name of the configuration, used in the snapshot names
 * @param {Object} env The environment variables of the STH process
 */
function corsSuite(matcher, configuration, env) {
    const requests = getRequests();
    let child;

    before(function(done) {
        this.timeout(15000);
        sthTestProcess.startSth(Object.assign({ STH_PORT: PORT }, env), function(err, theChild) {
            child = theChild;
            done(err);
        });
    });

    after(function(done) {
        this.timeout(15000);
        sthTestProcess.stopSth(child, 'SIGTERM', function() {
            done();
        });
    });

    Object.keys(requests).forEach(function(name) {
        const request = requests[name];
        const snapshotName = configuration + '.' + name;
        it(snapshotName + ': ' + request.method + ' ' + request.path, function(done) {
            sthHttpTestClient.sendRequest(
                {
                    method: request.method,
                    path: request.path,
                    port: PORT,
                    headers: Object.assign({ 'Fiware-Correlator': 'cors-' + name }, request.headers)
                },
                sthHttpTestClient.assertResponse(done, function(err, response) {
                    matcher.match(snapshotName, sthSnapshot.toSnapshot(request, err, response));
                })
            );
        });
    });
}

describe('CORS snapshots', function() {
    const matcher = sthSnapshot.createMatcher(path.join(__dirname, 'snapshots', 'sthCors.json'));

    after(function() {
        matcher.save();
    });

    describe('with CORS enabled', corsSuite.bind(null, matcher, 'enabled', { CORS_ENABLED: 'true' }));

    describe('with CORS disabled', corsSuite.bind(null, matcher, 'disabled', { CORS_ENABLED: 'false' }));
});
