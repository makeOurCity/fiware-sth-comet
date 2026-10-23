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

// Tests of the parts of sthDatabase which depend on the MongoDB Node.js driver API (6.x):
//  connection options, connection state and the "collection does not exist" error

const ROOT_PATH = require('app-root-path');
const sthConfig = require(ROOT_PATH + '/lib/configuration/sthConfiguration');
const sthDatabase = require(ROOT_PATH + '/lib/database/sthDatabase');
const sthDatabaseNaming = require(ROOT_PATH + '/lib/database/model/sthDatabaseNaming');
const expect = require('expect.js');
const mongodb = require('mongodb');

const DATABASE_CONNECTION_PARAMS = {
    authentication: sthConfig.DB_AUTHENTICATION,
    dbURI: sthConfig.DB_URI,
    replicaSet: sthConfig.REPLICA_SET,
    database: sthDatabaseNaming.getDatabaseName(sthConfig.DEFAULT_SERVICE),
    poolSize: sthConfig.POOL_SIZE
};

/**
 * Returns an error like the one the driver notifies when no server of the database is available
 * @return {Error} The error
 */
function getServerSelectionError() {
    return new mongodb.MongoServerSelectionError('Server selection timed out', { servers: new Map() });
}

describe('sthDatabase driver tests', function() {
    this.timeout(5000);

    describe('getConnectionOptions', function() {
        it('should map the pool size to the maxPoolSize option', function() {
            expect(sthDatabase.getConnectionOptions({ poolSize: 10 }).maxPoolSize).to.equal(10);
        });

        it('should map the reconnect tries and interval to the serverSelectionTimeoutMS option', function() {
            const options = sthDatabase.getConnectionOptions({ reconnectTries: 30, reconnectInterval: 1000 });
            expect(options.serverSelectionTimeoutMS).to.equal(30000);
        });

        it('should not set the serverSelectionTimeoutMS option if the reconnect tries are not set', function() {
            const options = sthDatabase.getConnectionOptions({ reconnectInterval: 1000 });
            expect(options).to.not.have.key('serverSelectionTimeoutMS');
        });

        it('should not set the serverSelectionTimeoutMS option if the reconnect interval is not set', function() {
            const options = sthDatabase.getConnectionOptions({ reconnectTries: 30 });
            expect(options).to.not.have.key('serverSelectionTimeoutMS');
        });

        it('should not set any option which is not supported by the driver', function() {
            const options = sthDatabase.getConnectionOptions({
                poolSize: 5,
                reconnectTries: 30,
                reconnectInterval: 1000
            });
            expect(Object.keys(options).sort()).to.eql(['maxPoolSize', 'serverSelectionTimeoutMS']);
        });
    });

    describe('isCollectionNotFoundError', function() {
        it('should return false if there is no error', function() {
            expect(sthDatabase.isCollectionNotFoundError(null)).to.be(false);
            expect(sthDatabase.isCollectionNotFoundError(undefined)).to.be(false);
        });

        it('should return false for other errors', function() {
            expect(sthDatabase.isCollectionNotFoundError(new Error('Collection x does not exist'))).to.be(false);
            expect(sthDatabase.isCollectionNotFoundError({ name: 'MongoConnectionError' })).to.be(false);
        });
    });

    describe('isConnectionError', function() {
        it('should return true for the errors notified when no server of the database is available', function() {
            expect(sthDatabase.isConnectionError(getServerSelectionError())).to.be(true);
        });

        it('should return true for the network errors', function() {
            expect(sthDatabase.isConnectionError(new mongodb.MongoNetworkError('connection closed'))).to.be(true);
            expect(sthDatabase.isConnectionError(new mongodb.MongoNetworkTimeoutError('timed out'))).to.be(true);
        });

        it('should return false for other errors', function() {
            expect(sthDatabase.isConnectionError(null)).to.be(false);
            expect(sthDatabase.isConnectionError(new Error('other'))).to.be(false);
            expect(sthDatabase.isConnectionError(new mongodb.MongoServerError({ message: 'other' }))).to.be(false);
        });
    });

    describe('connection state', function() {
        before(function(done) {
            sthDatabase.closeConnection(done);
        });

        it('should not be alive before connecting to the database', function() {
            expect(sthDatabase.isConnectionAlive()).to.be(false);
        });

        it('should be alive once connected to the database', function(done) {
            sthDatabase.connect(
                DATABASE_CONNECTION_PARAMS,
                function(err) {
                    expect(err).to.be(null);
                    expect(sthDatabase.isConnectionAlive()).to.be(true);
                    done();
                }
            );
        });

        it('should not be alive if the driver loses all the servers of the topology', function() {
            sthDatabase.client.emit('topologyDescriptionChanged', { newDescription: { hasKnownServers: false } });
            expect(sthDatabase.isConnectionAlive()).to.be(false);
        });

        it('should be alive again once the driver finds a server of the topology', function() {
            sthDatabase.client.emit('topologyDescriptionChanged', { newDescription: { hasKnownServers: true } });
            expect(sthDatabase.isConnectionAlive()).to.be(true);
        });

        it('should not be alive once the connection is closed', function(done) {
            sthDatabase.closeConnection(function(err) {
                expect(err).to.be(null);
                expect(sthDatabase.isConnectionAlive()).to.be(false);
                done();
            });
        });
    });

    describe('collection does not exist error', function() {
        before(function(done) {
            sthDatabase.connect(
                DATABASE_CONNECTION_PARAMS,
                done
            );
        });

        after(function(done) {
            sthDatabase.closeConnection(done);
        });

        it('should be notified as a MongoConnectionError if the database server becomes unavailable', function(done) {
            // The driver may not have noticed yet that the server is not available, so the connection is still
            //  considered alive but the operation fails after looking for an available server
            const client = sthDatabase.client;
            const originalDb = client.db;
            client.db = function() {
                return {
                    listCollections() {
                        return {
                            toArray() {
                                return Promise.reject(getServerSelectionError());
                            }
                        };
                    }
                };
            };
            sthDatabase.getCollection(
                {
                    service: sthConfig.DEFAULT_SERVICE,
                    servicePath: sthConfig.DEFAULT_SERVICE_PATH,
                    entityId: 'sthDatabaseDriverTestEntity',
                    entityType: 'sthDatabaseDriverTestType',
                    attrName: 'sthDatabaseDriverTestAttribute'
                },
                {
                    isAggregated: false,
                    shouldCreate: true,
                    shouldTruncate: false
                },
                function(err, collection) {
                    client.db = originalDb;
                    expect(err.name).to.equal('MongoConnectionError');
                    expect(collection).to.be(null);
                    done();
                }
            );
        });

        it('should be notified when getting a non-existent collection which should not be created', function(done) {
            sthDatabase.getCollection(
                {
                    service: sthConfig.DEFAULT_SERVICE,
                    servicePath: sthConfig.DEFAULT_SERVICE_PATH,
                    entityId: 'sthDatabaseDriverTestNonExistentEntity',
                    entityType: 'sthDatabaseDriverTestType',
                    attrName: 'sthDatabaseDriverTestAttribute'
                },
                {
                    isAggregated: false,
                    shouldCreate: false,
                    shouldTruncate: false
                },
                function(err, collection) {
                    expect(sthDatabase.isCollectionNotFoundError(err)).to.be(true);
                    expect(err.message).to.contain('does not exist');
                    expect(collection).to.be(null);
                    done();
                }
            );
        });
    });
});
