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

const ROOT_PATH = require('app-root-path');
const sthHttpTestClient = require(ROOT_PATH + '/test/unit/sthHttpTestClient');
const expect = require('expect.js');
const http = require('http');

/**
 * Starts a plain Node.js HTTP server listening on a random port
 * @param {Function} handler The request handler of the server
 * @param {Function} callback Callback function called with the server and the port it listens on
 */
function startPlainServer(handler, callback) {
    const server = http.createServer(handler);
    server.listen(0, 'localhost', function() {
        callback(server, server.address().port);
    });
}

describe('sthHttpTestClient tests', function() {
    let server;
    let port;
    let lastRequest;
    let pendingResponses;

    before(function(done) {
        pendingResponses = [];
        startPlainServer(
            function(req, res) {
                let body = '';
                req.setEncoding('utf8');
                req.on('data', function(chunk) {
                    body += chunk;
                });
                req.on('end', function() {
                    lastRequest = {
                        method: req.method,
                        url: req.url,
                        headers: req.headers,
                        body
                    };
                    if (req.url === '/never-responds') {
                        pendingResponses.push(res);
                        return;
                    }
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ echo: body }));
                });
            },
            function(createdServer, listeningPort) {
                server = createdServer;
                port = listeningPort;
                done();
            }
        );
    });

    after(function(done) {
        pendingResponses.forEach(function(res) {
            res.destroy();
        });
        server.close(function() {
            done();
        });
    });

    describe('assertResponse()', function() {
        it('should pass the error and the response to the assertions and call done() if they succeed', function() {
            const response = { statusCode: 200 };
            let receivedArgs;
            let doneArgs;
            const callback = sthHttpTestClient.assertResponse(
                function(...args) {
                    doneArgs = args;
                },
                function(err, res) {
                    receivedArgs = [err, res];
                }
            );
            callback(null, response);
            expect(receivedArgs).to.eql([null, response]);
            expect(doneArgs).to.eql([]);
        });

        it('should call done() with the assertion error instead of throwing it', function() {
            const assertionError = new Error('assertion failed');
            let doneArgs;
            const callback = sthHttpTestClient.assertResponse(
                function(...args) {
                    doneArgs = args;
                },
                function() {
                    throw assertionError;
                }
            );
            expect(callback)
                .withArgs(null, {})
                .to.not.throwException();
            expect(doneArgs).to.eql([assertionError]);
        });
    });

    describe('sendRequest()', function() {
        it('should resolve with the status code, the headers and the body of the response', function(done) {
            sthHttpTestClient.sendRequest(
                { port, method: 'GET', path: '/some/path' },
                sthHttpTestClient.assertResponse(done, function(err, response) {
                    expect(err).to.equal(null);
                    expect(response.statusCode).to.equal(201);
                    expect(response.headers['content-type']).to.equal('application/json');
                    expect(JSON.parse(response.body)).to.eql({ echo: '' });
                })
            );
        });

        it('should send the method, the path and the headers of the request', function(done) {
            sthHttpTestClient.sendRequest(
                {
                    port,
                    method: 'DELETE',
                    path: '/some/path?query=value',
                    headers: { 'Fiware-Service': 'testservice' }
                },
                sthHttpTestClient.assertResponse(done, function(err) {
                    expect(err).to.equal(null);
                    expect(lastRequest.method).to.equal('DELETE');
                    expect(lastRequest.url).to.equal('/some/path?query=value');
                    expect(lastRequest.headers['fiware-service']).to.equal('testservice');
                })
            );
        });

        it('should not keep the connection alive so that stopping the server is not delayed', function(done) {
            sthHttpTestClient.sendRequest(
                { port, method: 'GET', path: '/' },
                sthHttpTestClient.assertResponse(done, function(err) {
                    expect(err).to.equal(null);
                    expect(lastRequest.headers.connection).to.equal('close');
                })
            );
        });

        it('should send an object body serialized as JSON with its content type and length', function(done) {
            const body = { subscriptionId: 'x', contextResponses: [] };
            sthHttpTestClient.sendRequest(
                { port, method: 'POST', path: '/notify', body },
                sthHttpTestClient.assertResponse(done, function(err) {
                    expect(err).to.equal(null);
                    expect(JSON.parse(lastRequest.body)).to.eql(body);
                    expect(lastRequest.headers['content-type']).to.equal('application/json');
                    expect(lastRequest.headers['content-length']).to.equal(String(JSON.stringify(body).length));
                })
            );
        });

        it('should fail with an ETIMEDOUT error if no response is received in time', function(done) {
            const startTime = Date.now();
            sthHttpTestClient.sendRequest(
                { port, method: 'POST', path: '/never-responds', timeout: 200 },
                sthHttpTestClient.assertResponse(done, function(err, response) {
                    expect(err).to.be.an(Error);
                    expect(err.code).to.equal('ETIMEDOUT');
                    expect(err.message).to.contain('POST /never-responds');
                    expect(response).to.equal(undefined);
                    expect(Date.now() - startTime).to.be.lessThan(1000);
                })
            );
        });

        it('should not call back again once the request has timed out', function(done) {
            let calls = 0;
            sthHttpTestClient.sendRequest({ port, method: 'GET', path: '/never-responds', timeout: 100 }, function() {
                calls++;
            });
            setTimeout(function() {
                // Closing the pending responses would make a naive client call back a second time
                pendingResponses.forEach(function(res) {
                    res.destroy();
                });
                setTimeout(function() {
                    done(calls === 1 ? undefined : new Error('Expected 1 callback call but got ' + calls));
                }, 100);
            }, 200);
        });

        it('should fail with the connection error if the server is not reachable', function(done) {
            const unreachableServer = http.createServer();
            unreachableServer.listen(0, 'localhost', function() {
                const unreachablePort = unreachableServer.address().port;
                unreachableServer.close(function() {
                    sthHttpTestClient.sendRequest(
                        { port: unreachablePort, method: 'GET', path: '/' },
                        sthHttpTestClient.assertResponse(done, function(err) {
                            expect(err).to.be.an(Error);
                            expect(err.code).to.equal('ECONNREFUSED');
                        })
                    );
                });
            });
        });
    });
});
