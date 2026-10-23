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
 * Characterization tests of the startup and the shutdown of the STH application, run in a child process as in
 *  production. Each test starts its own process.
 */

/* eslint-disable consistent-return */

const ROOT_PATH = require('app-root-path');
const sthHttpTestClient = require(ROOT_PATH + '/test/unit/sthHttpTestClient');
const sthTestProcess = require(ROOT_PATH + '/test/unit/sthTestProcess');
const expect = require('expect.js');
const net = require('net');

const PORT = 8667;
// Nothing is expected to listen on this port
const CLOSED_DB_URI = 'localhost:1';
const PACKAGE_VERSION = require(ROOT_PATH + '/package.json').version;

const SHUTDOWN_MESSAGES = [
    'Stopping the STH server...',
    'hapi server successfully stopped',
    'Closing the connection to the database...',
    'Connection to MongoDb succesfully closed',
    'Application exited successfully'
];

/**
 * Checks that the output includes all the texts, in order
 * @param {String} output The output of the process
 * @param {Array} texts The texts
 */
function expectInOrder(output, texts) {
    let position = -1;
    texts.forEach(function(text) {
        const index = output.indexOf(text, position + 1);
        expect(index).to.be.greaterThan(position);
        position = index;
    });
}

/**
 * Returns a test which starts the application, checks that it serves requests, sends it a signal and checks that it
 *  exits gracefully
 * @param {String} signal The signal
 * @return {Function} The mocha test
 */
function gracefulShutdownTest(signal) {
    return function(done) {
        this.timeout(15000);
        sthTestProcess.startSth({ STH_PORT: PORT }, function(err, child) {
            if (err) {
                return done(err);
            }
            sthHttpTestClient.sendRequest({ method: 'GET', path: '/version', port: PORT }, function(err, response) {
                sthTestProcess.stopSth(child, signal, function(stopErr, exitInfo) {
                    try {
                        expect(err).to.equal(null);
                        expect(response.statusCode).to.equal(200);
                        expect(JSON.parse(response.body)).to.eql({ version: PACKAGE_VERSION });
                        expect(stopErr).to.equal(null);
                        expect(exitInfo).to.eql({ code: 0, signal: null });
                        expectInOrder(
                            child.output,
                            ['Received ' + signal + ', starting shutdown processs'].concat(SHUTDOWN_MESSAGES)
                        );
                    } catch (assertionError) {
                        return done(assertionError);
                    }
                    return done();
                });
            });
        });
    };
}

describe('STH process lifecycle', function() {
    describe('graceful shutdown', function() {
        it('should serve requests and exit with code 0 when receiving SIGTERM', gracefulShutdownTest('SIGTERM'));

        it('should serve requests and exit with code 0 when receiving SIGINT', gracefulShutdownTest('SIGINT'));

        it('should serve requests and exit with code 0 when receiving SIGHUP', gracefulShutdownTest('SIGHUP'));
    });

    describe('startup errors', function() {
        it('should exit with code 1 without starting the server if the database is not reachable', function(done) {
            this.timeout(15000);
            const startTime = Date.now();
            const child = sthTestProcess.spawnSth({
                STH_PORT: PORT,
                DB_URI: CLOSED_DB_URI,
                DB_RECONNECT_TRIES: 1,
                DB_RECONNECT_INTERVAL: 100
            });
            sthTestProcess.waitForExit(child, 10000, function(err, exitInfo) {
                try {
                    expect(err).to.equal(null);
                    expect(exitInfo).to.eql({ code: 1, signal: null });
                    // The first connection waits at most DB_RECONNECT_TRIES * DB_RECONNECT_INTERVAL
                    // (serverSelectionTimeoutMS, 100 ms here) and the process exits right away
                    expect(Date.now() - startTime).to.be.lessThan(5000);
                    expect(child.output).to.contain(
                        'Establishing connection to the database at mongodb://localhost:1/'
                    );
                    // The MongoDB driver 6.x reports the failure as a server selection error
                    expect(child.output).to.match(
                        /lvl=ERROR [^\n]*msg=MongoServerSelectionError: connect ECONNREFUSED [^\n]*:1\n/
                    );
                    expect(child.output).to.contain('No hapi server running');
                    expect(child.output).not.to.contain('Server started at');
                    expect(child.output).not.to.contain('Application exited successfully');
                } catch (assertionError) {
                    return done(assertionError);
                }
                return done();
            });
        });

        it('should exit with code 1 if the port is already in use', function(done) {
            this.timeout(15000);
            const blocker = net.createServer();
            blocker.listen(PORT, 'localhost', function() {
                const child = sthTestProcess.spawnSth({ STH_PORT: PORT });
                sthTestProcess.waitForExit(child, 10000, function(err, exitInfo) {
                    blocker.close(function() {
                        try {
                            expect(err).to.equal(null);
                            expect(exitInfo).to.eql({ code: 1, signal: null });
                            // The address depends on how localhost is resolved (127.0.0.1 or ::1)
                            expect(child.output).to.match(
                                new RegExp(
                                    'listen EADDRINUSE: address already in use \\S+:' +
                                        PORT +
                                        ' \\(another STH instance maybe already listening on the same port\\)'
                                )
                            );
                            expect(child.output).to.contain('Connection to MongoDb succesfully closed');
                            expect(child.output).not.to.contain('Application exited successfully');
                        } catch (assertionError) {
                            return done(assertionError);
                        }
                        return done();
                    });
                });
            });
        });
    });
});
