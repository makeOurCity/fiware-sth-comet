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

// Tests of the command line options parsing of the bin/sthDatabaseModelTool tool

const ROOT_PATH = require('app-root-path').toString();
const childProcess = require('child_process');
const expect = require('expect.js');
const path = require('path');

const TOOL_PATH = path.join(ROOT_PATH, 'bin', 'sthDatabaseModelTool');

/**
 * Runs the tool with the passed arguments
 * @param {Array} args The command line arguments
 * @return {Object} The result of the execution, including the status, stdout and stderr
 */
function runTool(args) {
    return childProcess.spawnSync(process.execPath, [TOOL_PATH].concat(args), {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { LOGOPS_LEVEL: 'FATAL' }),
        timeout: 10000
    });
}

describe('sthDatabaseModelTool command line tests', function() {
    this.timeout(15000);

    it('should print the version of the package', function() {
        const result = runTool(['-V']);
        expect(result.status).to.equal(0);
        expect(result.stdout.trim()).to.equal(require(ROOT_PATH + '/package.json').version);
    });

    it('should exit with an error if a collection is set but no database is set', function() {
        const result = runTool(['-a', '-c', 'a-collection']);
        expect(result.status).to.equal(1);
        expect(result.stderr).to.contain(
            "error: option '-d, --database <databaseName>' argument missing if '-c, --collection <collectionName>' " +
                'is set'
        );
        expect(result.stdout).not.to.contain('DATA MODEL ANALYSIS');
    });
});
