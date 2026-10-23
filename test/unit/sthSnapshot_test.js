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
const sthSnapshot = require(ROOT_PATH + '/test/unit/sthSnapshot');
const expect = require('expect.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('sthSnapshot', function () {
    describe('pickHeaders', function () {
        it('should keep only the relevant headers, sorted by name', function () {
            const headers = sthSnapshot.pickHeaders({
                date: 'Fri, 23 Oct 2026 10:00:00 GMT',
                connection: 'close',
                vary: 'origin',
                'cache-control': 'no-cache',
                'fiware-total-count': '3',
                'content-type': 'application/json; charset=utf-8',
                'access-control-allow-origin': '*',
                'fiware-correlator': 'corr-1'
            });
            expect(Object.keys(headers)).to.eql([
                'access-control-allow-origin',
                'content-type',
                'fiware-correlator',
                'fiware-total-count'
            ]);
        });

        it('should replace a generated correlator by a placeholder', function () {
            const headers = sthSnapshot.pickHeaders({
                'fiware-correlator': '0f1e2d3c-4b5a-4697-8877-665544332211'
            });
            expect(headers['fiware-correlator']).to.equal('<uuid>');
        });

        it('should replace the timestamp and counter of the CSV file name', function () {
            const headers = sthSnapshot.pickHeaders({
                'content-disposition': "attachment; filename*= utf-8''temperature-1792790455796-12.csv"
            });
            expect(headers['content-disposition']).to.equal(
                "attachment; filename*= utf-8''temperature-<timestamp>-<counter>.csv"
            );
        });
    });

    describe('normalizeBody', function () {
        it('should parse JSON bodies and replace ObjectIds by a placeholder', function () {
            const body = sthSnapshot.normalizeBody(
                '{"value":[{"_id":"5f1e2d3c4b5a69788766554a","attrValue":1}]}',
                'application/json; charset=utf-8'
            );
            expect(body).to.eql({ value: [{ _id: '<ObjectId>', attrValue: 1 }] });
        });

        it('should keep non JSON bodies as strings', function () {
            expect(sthSnapshot.normalizeBody('a,b\n1,2', 'application/octet-stream')).to.equal('a,b\n1,2');
        });

        it('should replace the time zone names of the dates in non JSON bodies, which depend on the locale', function () {
            expect(
                sthSnapshot.normalizeBody(
                    'a,Fri Oct 23 2026 11:00:00 GMT+0000 (Coordinated Universal Time)\r\n' +
                        'b,Fri Oct 23 2026 11:00:00 GMT+0000 (協定世界時)\r\n',
                    'application/octet-stream'
                )
            ).to.equal(
                'a,Fri Oct 23 2026 11:00:00 GMT+0000 (<time zone name>)\r\n' +
                    'b,Fri Oct 23 2026 11:00:00 GMT+0000 (<time zone name>)\r\n'
            );
        });

        it('should keep an empty body as an empty string', function () {
            expect(sthSnapshot.normalizeBody('', undefined)).to.equal('');
        });
    });

    describe('normalizeResponse', function () {
        it('should return the status code, the relevant headers and the normalized body', function () {
            expect(
                sthSnapshot.normalizeResponse({
                    statusCode: 400,
                    headers: { date: 'now', 'content-type': 'application/json' },
                    body: '{"statusCode":400}'
                })
            ).to.eql({ statusCode: 400, headers: { 'content-type': 'application/json' }, body: { statusCode: 400 } });
        });
    });

    describe('toSnapshot', function () {
        it('should include the request and the normalized response', function () {
            expect(
                sthSnapshot.toSnapshot({ method: 'GET', path: '/version' }, null, {
                    statusCode: 200,
                    headers: {},
                    body: ''
                })
            ).to.eql({ request: 'GET /version', response: { statusCode: 200, headers: {}, body: '' } });
        });

        it('should record that no response was received in time', function () {
            const err = new Error('No complete response');
            err.code = 'ETIMEDOUT';
            expect(sthSnapshot.toSnapshot({ method: 'DELETE', path: '/x' }, err)).to.eql({
                request: 'DELETE /x',
                error: 'ETIMEDOUT'
            });
        });

        it('should throw any other error', function () {
            const err = new Error('connect ECONNREFUSED');
            err.code = 'ECONNREFUSED';
            expect(function () {
                sthSnapshot.toSnapshot({ method: 'GET', path: '/x' }, err);
            }).to.throwException(/ECONNREFUSED/);
        });
    });

    describe('snapshot matcher', function () {
        let snapshotFile;

        beforeEach(function () {
            snapshotFile = path.join(os.tmpdir(), 'sthSnapshot_test-' + process.pid + '-' + Date.now() + '.json');
        });

        afterEach(function () {
            if (fs.existsSync(snapshotFile)) {
                fs.unlinkSync(snapshotFile);
            }
        });

        it('should pass when the actual value equals the stored snapshot', function () {
            fs.writeFileSync(snapshotFile, JSON.stringify({ step: { a: 1 } }));
            const matcher = sthSnapshot.createMatcher(snapshotFile, false);
            matcher.match('step', { a: 1 });
        });

        it('should fail showing both values when the actual value differs from the stored snapshot', function () {
            fs.writeFileSync(snapshotFile, JSON.stringify({ step: { a: 1 } }));
            const matcher = sthSnapshot.createMatcher(snapshotFile, false);
            expect(function () {
                matcher.match('step', { a: 2 });
            }).to.throwException(function (err) {
                expect(err.message).to.contain('"a": 1');
                expect(err.message).to.contain('"a": 2');
            });
        });

        it('should fail explaining how to record it when there is no snapshot', function () {
            const matcher = sthSnapshot.createMatcher(snapshotFile, false);
            expect(function () {
                matcher.match('step', { a: 1 });
            }).to.throwException(/UPDATE_SNAPSHOTS=1/);
        });

        it('should record the actual values and keep the other snapshots in update mode', function () {
            fs.writeFileSync(snapshotFile, JSON.stringify({ other: 'kept', step: { a: 1 } }));
            const matcher = sthSnapshot.createMatcher(snapshotFile, true);
            matcher.match('step', { a: 2 });
            matcher.save();
            expect(JSON.parse(fs.readFileSync(snapshotFile, 'utf8'))).to.eql({ other: 'kept', step: { a: 2 } });
        });

        it('should not write the file when not in update mode', function () {
            const matcher = sthSnapshot.createMatcher(snapshotFile, false);
            matcher.save();
            expect(fs.existsSync(snapshotFile)).to.equal(false);
        });
    });

    describe('isUpdateMode', function () {
        it('should be enabled only when UPDATE_SNAPSHOTS is 1 or true', function () {
            expect(sthSnapshot.isUpdateMode({ UPDATE_SNAPSHOTS: '1' })).to.equal(true);
            expect(sthSnapshot.isUpdateMode({ UPDATE_SNAPSHOTS: 'true' })).to.equal(true);
            expect(sthSnapshot.isUpdateMode({ UPDATE_SNAPSHOTS: '0' })).to.equal(false);
            expect(sthSnapshot.isUpdateMode({})).to.equal(false);
        });
    });
});
