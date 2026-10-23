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
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const sthHeaderValidator = require(ROOT_PATH + '/lib/server/validators/sthHeaderValidator');
const expect = require('expect.js');

/**
 * Calls the header validator returning the error it throws, if any
 * @param {Object} headers The headers to validate
 * @return {Error} The thrown error or undefined
 */
function getValidationError(headers) {
    try {
        sthHeaderValidator(headers, {});
    } catch (err) {
        return err;
    }
    return undefined;
}

describe('sthHeaderValidator tests', function() {
    it('should not throw if the Fiware-Service and Fiware-ServicePath headers are included', function() {
        const headers = {};
        headers[sthConfig.HEADER.FIWARE_SERVICE] = 'testservice';
        headers[sthConfig.HEADER.FIWARE_SERVICE_PATH] = '/testservicepath';
        expect(getValidationError(headers)).to.be(undefined);
    });

    it('should throw a 400 Bad Request error if the Fiware-Service header is missing', function() {
        const headers = {};
        headers[sthConfig.HEADER.FIWARE_SERVICE_PATH] = '/testservicepath';
        const error = getValidationError(headers);
        expect(error.isBoom).to.be(true);
        expect(error.output.statusCode).to.equal(400);
        expect(error.output.payload.message).to.equal(
            'child "fiware-service" fails because [fiware-service is required]'
        );
    });

    it('should throw a 400 Bad Request error if the Fiware-ServicePath header is missing', function() {
        const headers = {};
        headers[sthConfig.HEADER.FIWARE_SERVICE] = 'testservice';
        const error = getValidationError(headers);
        expect(error.isBoom).to.be(true);
        expect(error.output.statusCode).to.equal(400);
        expect(error.output.payload.message).to.equal(
            'child "fiware-servicepath" fails because [fiware-servicepath is required]'
        );
    });
});
