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
const sthUtils = require(ROOT_PATH + '/lib/utils/sthUtils');
const expect = require('expect.js');

describe('sthUtils tests', function () {
    describe('promiseToCallback', function () {
        it('should call the callback with null and the result if the promise is fulfilled', function (done) {
            sthUtils.promiseToCallback(Promise.resolve('result'), function (err, result) {
                expect(err).to.be(null);
                expect(result).to.equal('result');
                expect(arguments.length).to.equal(2);
                done();
            });
        });

        it('should call the callback with the error if the promise is rejected', function (done) {
            const error = new Error('rejected');
            sthUtils.promiseToCallback(Promise.reject(error), function (err) {
                expect(err).to.be(error);
                expect(arguments.length).to.equal(1);
                done();
            });
        });

        it('should not swallow the exceptions thrown by the callback', function (done) {
            const listeners = process.listeners('uncaughtException');
            process.removeAllListeners('uncaughtException');
            process.once('uncaughtException', function (err) {
                listeners.forEach(function (listener) {
                    process.on('uncaughtException', listener);
                });
                expect(err.message).to.equal('thrown by the callback');
                done();
            });
            sthUtils.promiseToCallback(Promise.resolve(), function () {
                throw new Error('thrown by the callback');
            });
        });

        it('should not fail if no callback is provided', function (done) {
            sthUtils.promiseToCallback(Promise.reject(new Error('ignored')));
            setImmediate(done);
        });
    });
});
