// Copyright 2014 A Medium Corporation.

var S3Stream = require('./lib/Stream')
var CombinedReadable = require('./lib/CombinedReadable')

/**
 * Helper functionality for working with S3.
 *
 * @example
 *   var AWS = require('aws-sdk')
 *   var s3 = new AWS.S3(configParams)
 *   var canoe = new Canoe(s3)
 *
 * @constructor
 * @param {Object} s3 Authenticated instance of AWS.S3
 */
function Canoe(s3) {
  this.s3 = s3
}
module.exports = Canoe


/**
 * Create a writable stream to upload an object to S3.
 *
 * @example
 *   var canoe = new Canoe(s3)
 *   var s3stream = canoe.createWriteStream({
 *     Bucket: 'random-access-memories',
 *     Key: 'to-get-lucky.log'
 *   })
 *   fs.createReadStream('./for-good-fun.log').pipe(s3stream)
 *
 * @param {Object} params Params to create an instance of S3Stream
 * @param {Function=} callback Called when the stream is ready.
 * @return {Stream} Writable stream
 */
Canoe.prototype.createWriteStream = function (params, callback) {
  var s3stream = new S3Stream(params, this.s3)

  this.s3.createMultipartUpload(params, function (err, data) {
    // Default callback to a noop
    callback = callback || function () {}

    // Pass errors to the callback and emit them from the stream
    if (err) {
      s3stream.emit('error', err)
      return callback(err)
    }

    // Set the `UploadId` from S3
    s3stream.params.UploadId = data.UploadId

    // Run the callback
    callback(null, s3stream)

    // Fire the 'writable' event after the callback, in case the callback is
    // mistakenly waiting for the event.
    s3stream.emit('writable')
  })

  // Return the write stream
  return s3stream
}

/**
 * Stream objects by prefix.
 *
 * @example
 *   var canoe = new Canoe(s3)
 *   var params = {Bucket: 'stuff', Key: 'path/to/things/'}
 *   canoe.createPrefixedReadStream(params, function (err, readable) {
 *     readable.pipe(process.stdout)
 *   })
 *
 * @param {Object} params Parameters to list objects
 * @param {String} params.Bucket The S3 bucket to download from
 * @param {String} params.Prefix The S3 prefix to download from
 * @param {Function} callback Called with error, stream
 */
Canoe.prototype.createPrefixedReadStream = function (params, callback) {
  var streams = []
  this.s3.listObjects(params).eachItem(function (err, data) {
    if (err) {
      return callback(err)
    }

    // null data without an error indicates no more paging
    if (data === null) {
      var composed = new CombinedReadable(streams)
      return callback(null, composed)
    }

    var req = this.s3.getObject({
      Bucket: params.Bucket,
      Key: data.Key
    })

    streams.push(req.createReadStream())
  }.bind(this))
}
