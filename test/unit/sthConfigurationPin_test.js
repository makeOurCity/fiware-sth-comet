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
const sthConfigurationPin = require(ROOT_PATH + '/test/unit/sthConfigurationPin');
const expect = require('expect.js');

describe('sthConfigurationPin', function () {
    let originalDataModel;

    beforeEach(function () {
        originalDataModel = sthConfig.DATA_MODEL;
    });

    afterEach(function () {
        sthConfig.DATA_MODEL = originalDataModel;
    });

    it('should set the configuration values changed by other tests back to their initial values', function () {
        sthConfig.DATA_MODEL = sthConfig.DATA_MODELS.COLLECTION_PER_SERVICE_PATH;
        sthConfigurationPin.pinInitialConfiguration();
        expect(sthConfig.DATA_MODEL).to.equal(sthConfigurationPin.INITIAL_CONFIGURATION.DATA_MODEL);
    });

    it('should return a function restoring the values previous to pinning them', function () {
        sthConfig.DATA_MODEL = sthConfig.DATA_MODELS.COLLECTION_PER_SERVICE_PATH;
        const restore = sthConfigurationPin.pinInitialConfiguration();
        restore();
        expect(sthConfig.DATA_MODEL).to.equal(sthConfig.DATA_MODELS.COLLECTION_PER_SERVICE_PATH);
    });
});
