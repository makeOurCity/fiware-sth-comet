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
 * Some test files change the configuration of the module lib/configuration/sthConfiguration.js shared by all the
 *  test files (for example, the data model) and do not set it back. The tests which depend on the default
 *  configuration, such as the snapshot tests, use pinInitialConfiguration() to set the values back to the ones read
 *  when the configuration module was loaded, before any test was run.
 */

const ROOT_PATH = require('app-root-path');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');

// Configuration values changed by other test files
const PINNED_KEYS = ['DATA_MODEL', 'NAME_ENCODING', 'NAME_MAPPING', 'NAME_SEPARATOR'];

/**
 * Returns the current values of the pinned configuration keys
 * @return {Object} The values by key
 */
function getPinnedValues() {
    const values = {};
    PINNED_KEYS.forEach(function(key) {
        values[key] = sthConfig[key];
    });
    return values;
}

/**
 * Sets the values of the configuration
 * @param {Object} values The values by key
 */
function setValues(values) {
    Object.keys(values).forEach(function(key) {
        sthConfig[key] = values[key];
    });
}

// Mocha loads all the test files before running any test, so these are the values read from the configuration
const INITIAL_CONFIGURATION = Object.freeze(getPinnedValues());

/**
 * Sets the configuration values changed by other test files back to their initial values
 * @return {Function} Function setting the values back to the ones previous to calling this function
 */
function pinInitialConfiguration() {
    const previousValues = getPinnedValues();
    setValues(INITIAL_CONFIGURATION);
    return setValues.bind(null, previousValues);
}

module.exports = {
    INITIAL_CONFIGURATION,
    pinInitialConfiguration
};
