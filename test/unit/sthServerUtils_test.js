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
const joi = require('joi');

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
    describe('getContext', function() {
        const UUID_V4_REGEXP = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

        it('should generate a version 4 UUID as the transaction and use it as the correlator by default', function() {
            const context = sthServerUtils.getContext({ method: 'get', headers: {} });
            expect(context.trans).to.match(UUID_V4_REGEXP);
            expect(context.corr).to.equal(context.trans);
        });

        it('should generate a distinct transaction for each request', function() {
            const first = sthServerUtils.getContext({ method: 'get', headers: {} });
            const second = sthServerUtils.getContext({ method: 'get', headers: {} });
            expect(first.trans).not.to.equal(second.trans);
        });

        it('should use the Fiware-Correlator header as the correlator if included in the request', function() {
            const context = sthServerUtils.getContext({
                method: 'get',
                headers: { 'fiware-correlator': 'the-correlator' }
            });
            expect(context.corr).to.equal('the-correlator');
            expect(context.trans).to.match(UUID_V4_REGEXP);
        });
    });

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

    describe('getListenAddress', function() {
        it('should resolve localhost to the IPv4 loopback address, as Node.js 16 and lower did', function() {
            return sthServerUtils.getListenAddress('localhost').then(function(address) {
                expect(address).to.equal('127.0.0.1');
            });
        });

        it('should keep an IPv4 address as is', function() {
            return sthServerUtils.getListenAddress('0.0.0.0').then(function(address) {
                expect(address).to.equal('0.0.0.0');
            });
        });

        it('should keep an IPv6 address as is', function() {
            return sthServerUtils.getListenAddress('::1').then(function(address) {
                expect(address).to.equal('::1');
            });
        });

        it('should keep an undefined host as is so the server listens on all the interfaces', function() {
            return sthServerUtils.getListenAddress(undefined).then(function(address) {
                expect(address).to.equal(undefined);
            });
        });

        it('should fail if the host name cannot be resolved', function() {
            return sthServerUtils.getListenAddress('unresolvable.invalid').then(
                function() {
                    throw new Error('Expected the promise to be rejected');
                },
                function(err) {
                    expect(err.code).to.equal('ENOTFOUND');
                }
            );
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

    describe('getLegacyValidationMessage', function() {
        const schema = joi.object({
            lastN: joi
                .number()
                .integer()
                .greater(-1),
            aggrPeriod: joi.string().valid('month', 'day'),
            dateFrom: joi.date(),
            level: joi.string().required()
        });

        /**
         * Returns the validation error of the provided value against the test schema
         * @param {Object} value The value to validate
         * @return {Error} The validation error
         */
        function getValidationError(value) {
            return schema.validate(Object.assign({ level: 'INFO' }, value)).error;
        }

        it('should wrap the message of an invalid key as joi 14 did', function() {
            expect(sthServerUtils.getLegacyValidationMessage(getValidationError({ lastN: -1 }))).to.equal(
                'child "lastN" fails because ["lastN" must be greater than -1]'
            );
        });

        it('should wrap the message of a missing required key as joi 14 did', function() {
            expect(sthServerUtils.getLegacyValidationMessage(schema.validate({}).error)).to.equal(
                'child "level" fails because ["level" is required]'
            );
        });

        it('should wrap the message of a value not allowed as joi 14 did', function() {
            expect(sthServerUtils.getLegacyValidationMessage(getValidationError({ aggrPeriod: 'year' }))).to.equal(
                'child "aggrPeriod" fails because ["aggrPeriod" must be one of [month, day]]'
            );
        });

        it('should use the joi 14 message for an invalid date', function() {
            expect(sthServerUtils.getLegacyValidationMessage(getValidationError({ dateFrom: 'x' }))).to.equal(
                'child "dateFrom" fails because ["dateFrom" must be a number of milliseconds or valid date string]'
            );
        });

        it('should not wrap the message of an unknown key, as joi 14 did not', function() {
            expect(sthServerUtils.getLegacyValidationMessage(getValidationError({ foo: 'bar' }))).to.equal(
                '"foo" is not allowed'
            );
        });

        it('should return the message of an error without validation details as is', function() {
            const error = boom.badRequest('child "fiware-service" fails because [fiware-service is required]');
            expect(sthServerUtils.getLegacyValidationMessage(error)).to.equal(
                'child "fiware-service" fails because [fiware-service is required]'
            );
        });
    });
});
