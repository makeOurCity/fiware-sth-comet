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

/* eslint-disable consistent-return */

// Tests of the CSV files generated when the raw data is requested with filetype=csv

const ROOT_PATH = require('app-root-path').toString();
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const sthDatabase = require(ROOT_PATH + '/lib/database/sthDatabase');
const expect = require('expect.js');
const fs = require('fs');
const path = require('path');
const Readable = require('stream').Readable;

const RECV_TIME = new Date('2026-10-23T10:15:30.000Z');

/**
 * Generates a CSV file from the passed raw data entries and returns its contents
 * @param {string} attrName The attribute name
 * @param {Array} rawData The raw data entries
 * @param {Function} callback The callback, called with the generated file path and contents
 */
function generateCSV(attrName, rawData, callback) {
    sthDatabase.generateCSV(attrName, Readable.from(rawData), function (err, filePath) {
        if (err) {
            return callback(err);
        }
        callback(null, filePath, fs.readFileSync(filePath, 'utf8'));
    });
}

describe('sthDatabase CSV generation tests', function () {
    const originalTemporalDir = sthConfig.TEMPORAL_DIR;
    const testTemporalRootDir = 'temp-csv-test';
    const generatedFiles = [];

    afterEach(function () {
        sthConfig.TEMPORAL_DIR = originalTemporalDir;
        generatedFiles.splice(0).forEach(function (filePath) {
            fs.unlinkSync(filePath);
        });
        fs.rmSync(ROOT_PATH + path.sep + testTemporalRootDir, { recursive: true, force: true });
    });

    it('should generate a CSV file including a header and a line per raw data entry', function (done) {
        const rawData = [
            { _id: 'id1', attrName: 'temperature', attrType: 'Number', attrValue: '20', recvTime: RECV_TIME },
            { _id: 'id2', attrName: 'temperature', attrType: 'Number', attrValue: 21.5, recvTime: RECV_TIME }
        ];
        generateCSV('temperature', rawData, function (err, filePath, contents) {
            if (err) {
                return done(err);
            }
            generatedFiles.push(filePath);
            expect(contents).to.equal(
                'attrName,attrType,attrValue,recvTime\r\n' +
                    'temperature,Number,20,' +
                    RECV_TIME.toString() +
                    '\r\n' +
                    'temperature,Number,21.5,' +
                    RECV_TIME.toString() +
                    '\r\n'
            );
            done();
        });
    });

    it('should use the requested attribute name even if the raw data entries do not include it', function (done) {
        const rawData = [{ attrType: 'Text', attrValue: 'ok', recvTime: RECV_TIME }];
        generateCSV('status', rawData, function (err, filePath, contents) {
            if (err) {
                return done(err);
            }
            generatedFiles.push(filePath);
            expect(contents).to.equal(
                'attrName,attrType,attrValue,recvTime\r\nstatus,Text,ok,' + RECV_TIME.toString() + '\r\n'
            );
            done();
        });
    });

    it('should quote the values including commas, double quotes or line breaks', function (done) {
        const rawData = [
            { attrType: 'Text', attrValue: 'a,b', recvTime: RECV_TIME },
            { attrType: 'Text', attrValue: 'say "hi"', recvTime: RECV_TIME },
            { attrType: 'Text', attrValue: 'line1\nline2', recvTime: RECV_TIME }
        ];
        generateCSV('status', rawData, function (err, filePath, contents) {
            if (err) {
                return done(err);
            }
            generatedFiles.push(filePath);
            expect(contents.split('\r\n')).to.eql([
                'attrName,attrType,attrValue,recvTime',
                'status,Text,"a,b",' + RECV_TIME.toString(),
                'status,Text,"say ""hi""",' + RECV_TIME.toString(),
                'status,Text,"line1\nline2",' + RECV_TIME.toString(),
                ''
            ]);
            done();
        });
    });

    it('should create the temporal directory, including its parent directories, if it does not exist', function (done) {
        sthConfig.TEMPORAL_DIR = testTemporalRootDir + path.sep + 'nested';
        generateCSV('temperature', [], function (err, filePath, contents) {
            if (err) {
                return done(err);
            }
            expect(path.dirname(filePath)).to.equal(ROOT_PATH + path.sep + sthConfig.TEMPORAL_DIR);
            // No header is included if there is no raw data
            expect(contents).to.equal('');
            done();
        });
    });
});
