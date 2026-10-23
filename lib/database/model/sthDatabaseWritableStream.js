/*
 * Copyright 2015 Telefónica Investigación y Desarrollo, S.A.U
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

/* eslint-disable consistent-return */

const ROOT_PATH = require('app-root-path');
const stream = require('stream');
const _ = require('lodash');
const sthDatabase = require(ROOT_PATH + '/lib/database/sthDatabase');
const sthUtils = require(ROOT_PATH + '/lib/utils/sthUtils');

const STHWritableStream = function(databaseConnection, databaseName, collectionName, count) {
    stream.Writable.call(this, { objectMode: true });
    this.databaseConnection = databaseConnection;
    this.databaseName = databaseName;
    this.collectionName = collectionName;
    this.originalCount = count;
    this.count = 0;
};

STHWritableStream.prototype = Object.create(stream.Writable.prototype);

/**
 * Updates a raw data collection inserting or updating the passed doc
 * @param  {Object}   doc        The object to insert or update
 * @param  {Object}   collection The collection to insert or update the doc into
 * @param  {Function} callback   The callback
 */
function updateRawData(doc, collection, callback) {
    const self = this;
    const docId = _.cloneDeep(doc);
    delete docId._id;
    delete docId.attrValue;
    delete doc._id;
    const replacement = collection.replaceOne(docId, doc, {
        upsert: true,
        writeConcern: sthDatabase.getWriteConcern()
    });
    sthUtils.promiseToCallback(replacement, function(err) {
        if (err) {
            return process.nextTick(callback.bind(null, err));
        }
        self.emit('progress', { total: self.originalCount, count: ++self.count });
        process.nextTick(callback);
    });
}

/**
 * Returns a MondoDB query from a document object id used in the aggregated data collections
 * @param  {Object} docId A document object id
 * @return {Object}       The MondoDB find() query
 */
function getQuery(docId) {
    const query = {};
    const properties = Object.keys(docId._id);
    properties.forEach(function(property) {
        query['_id.' + property] = docId._id[property];
    });
    return query;
}

/**
 * Combines the data stored in the origin collection into the associated point of the target collection
 *  in case of textual aggregation
 * @param  {Object} originalPoint The point from the origin collection
 * @param  {Object} targetPoint   The point from the target collection where the data will be combined
 */
function mixTextualAggregation(originalPoint, targetPoint) {
    Object.keys(originalPoint.occur).forEach(function(originalTag) {
        targetPoint.occur[originalTag] = (targetPoint.occur[originalTag] || 0) + originalPoint.occur[originalTag];
    });
}

/**
 * Combines the data stored in the origin collection into the associated point of the target collection
 *  in case of numeric aggregation
 * @param  {Object} originalPoint The point from the origin collection
 * @param  {Object} targetPoint   The point from the target collection where the data will be combined
 */
function mixNumericAggregation(originalPoint, targetPoint) {
    targetPoint.sum += originalPoint.sum;
    targetPoint.sum2 += originalPoint.sum2;
    targetPoint.min = Math.min(originalPoint.min, targetPoint.min);
    targetPoint.max = Math.min(originalPoint.max, targetPoint.max);
}

/**
 * Updates an aggregated data collection
 * @param  {Object}   doc        The document to store in the collection
 * @param  {Object}   collection The collection where the document should be stored
 * @param  {Function} callback   The callback
 */
function updateAggregatedData(doc, collection, callback) {
    const self = this;
    sthUtils.promiseToCallback(collection.findOne(getQuery({ _id: doc._id })), function(err, doc2Update) {
        if (err) {
            return process.nextTick(callback.bind(null, err));
        }
        if (!doc2Update) {
            sthUtils.promiseToCallback(collection.insertOne(doc), function(err) {
                if (err) {
                    return process.nextTick(callback.bind(null, err));
                }
                self.emit('progress', { total: self.originalCount, count: ++self.count });
                process.nextTick(callback);
            });
        } else {
            doc2Update.points.forEach(function(point, index) {
                doc.points[index].samples += point.samples;
                if (point.occur) {
                    mixTextualAggregation(point, doc.points[index]);
                } else {
                    mixNumericAggregation(point, doc.points[index]);
                }
            });
            delete doc._id;
            const replacement = collection.replaceOne({ _id: doc2Update._id }, doc, {
                upsert: false,
                writeConcern: sthDatabase.getWriteConcern()
            });
            sthUtils.promiseToCallback(replacement, function(err) {
                if (err) {
                    return process.nextTick(callback.bind(null, err));
                }
                self.emit('progress', { total: self.originalCount, count: ++self.count });
                return process.nextTick(callback);
            });
        }
    });
}

/**
 * Inserts a document into a collection
 * @param doc The document to insert
 * @param collection
 * @param callback
 */
function upsert(doc, collection, callback) {
    if (sthDatabase.isAggregated(this.collectionName)) {
        updateAggregatedData.call(this, doc, collection, callback);
    } else {
        updateRawData.call(this, doc, collection, callback);
    }
}

/**
 * Writable stream _write() function
 * @param doc The document to write
 * @param encoding The encoding
 * @param callback The callback
 * @private
 */
STHWritableStream.prototype._write = function(doc, encoding, callback) {
    this.db = this.databaseConnection.db(this.databaseName);
    upsert.call(this, doc, this.db.collection(this.collectionName), callback);
};

module.exports = STHWritableStream;
