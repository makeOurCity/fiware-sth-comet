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
const sthServerUtils = require(ROOT_PATH + '/lib/server/utils/sthServerUtils');
const boom = require('@hapi/boom');
const expect = require('expect.js');

/**
 * Returns a fake of the hapi response toolkit (h) which records the responses it creates
 * @return {Object} The fake toolkit, including the list of created responses
 */
function createFakeToolkit() {
    const toolkit = {
        responses: [],
        response(source) {
            const response = {
                source,
                headers: {},
                header(name, value) {
                    this.headers[name] = value;
                    return this;
                },
                code(statusCode) {
                    this.statusCode = statusCode;
                    return this;
                }
            };
            toolkit.responses.push(response);
            return response;
        }
    };
    return toolkit;
}

describe('sthServerUtils tests', function() {
    describe('getRequestPath', function() {
        it('should return the path including the query string', function() {
            const request = { path: '/STH/v1/x', url: new URL('http://localhost:8666/STH/v1/x?lastN=1&count=true') };
            expect(sthServerUtils.getRequestPath(request)).to.equal('/STH/v1/x?lastN=1&count=true');
        });

        it('should return the path if there is no query string', function() {
            const request = { path: '/version', url: new URL('http://localhost:8666/version') };
            expect(sthServerUtils.getRequestPath(request)).to.equal('/version');
        });
    });

    describe('toHapiHandler', function() {
        it('should resolve with the response created from the value passed to reply()', function() {
            const h = createFakeToolkit();
            const handler = sthServerUtils.toHapiHandler(function(request, reply) {
                reply({ level: 'INFO' });
            });
            return handler({}, h).then(function(response) {
                expect(response).to.be(h.responses[0]);
                expect(response.source).to.eql({ level: 'INFO' });
            });
        });

        it('should let the legacy handler set the headers and the status code after replying', function() {
            const h = createFakeToolkit();
            const handler = sthServerUtils.toHapiHandler(function(request, reply) {
                setImmediate(function() {
                    const response = reply();
                    response.code(204);
                    response.header('Fiware-Correlator', 'corr');
                });
            });
            return handler({}, h).then(function(response) {
                expect(response.statusCode).to.equal(204);
                expect(response.headers).to.eql({ 'Fiware-Correlator': 'corr' });
            });
        });

        it('should resolve with the error passed to reply() so hapi responds with it', function() {
            const h = createFakeToolkit();
            const error = boom.badRequest('bad');
            const handler = sthServerUtils.toHapiHandler(function(request, reply) {
                const response = reply(error);
                expect(response).to.be(error);
            });
            return handler({}, h).then(function(response) {
                expect(response).to.be(error);
                expect(h.responses).to.have.length(0);
            });
        });

        it('should pass the request to the legacy handler', function() {
            const h = createFakeToolkit();
            const request = { path: '/version' };
            const handler = sthServerUtils.toHapiHandler(function(receivedRequest, reply) {
                reply(receivedRequest.path);
            });
            return handler(request, h).then(function(response) {
                expect(response.source).to.equal('/version');
            });
        });

        it('should keep the first reply if the legacy handler replies more than once', function() {
            const h = createFakeToolkit();
            const handler = sthServerUtils.toHapiHandler(function(request, reply) {
                reply('first');
                reply('second');
            });
            return handler({}, h).then(function(response) {
                expect(response.source).to.equal('first');
            });
        });
    });
});
