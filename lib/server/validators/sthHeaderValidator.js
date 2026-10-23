/*
 * Copyright 2016 Telefónica Investigación y Desarrollo, S.A.U
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
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with: [german.torodelvalle@telefonica.com]
 */

const ROOT_PATH = require('app-root-path');
const sthLogger = require('logops');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const boom = require('@hapi/boom');

/**
 * Header validation handler
 * @param value The headers
 * @throws {Error} A 400 - Bad Request error if the Fiware-Service or the Fiware-ServicePath header is missing
 */
function headerValidator(value) {
    let message;

    if (!value[sthConfig.HEADER.FIWARE_SERVICE]) {
        // prettier-ignore
        message = 'child "' + sthConfig.HEADER.FIWARE_SERVICE + '" fails because [' +
            sthConfig.HEADER.FIWARE_SERVICE + ' is required]';
        sthLogger.warn('error=' + sthConfig.LOGGING_CONTEXT.SERVER_LOG, message);
        throw boom.badRequest(message);
    } else if (!value[sthConfig.HEADER.FIWARE_SERVICE_PATH]) {
        // prettier-ignore
        message = 'child "' + sthConfig.HEADER.FIWARE_SERVICE_PATH + '" fails because [' + 
            sthConfig.HEADER.FIWARE_SERVICE_PATH + ' is required]';
        sthLogger.warn('error=' + sthConfig.LOGGING_CONTEXT.SERVER_LOG, message);
        throw boom.badRequest(message);
    }
}

module.exports = headerValidator;
