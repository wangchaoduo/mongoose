'use strict';

const assert = require('assert');
const start = require('../common');

const mongoose = start.mongoose;
const Schema = mongoose.Schema;

describe('transactions', function() {
  let db;

  before(function() {
    db = start({ replicaSet: 'rs' });

    return db.
      then(() => {
        // Skip if not a repl set
        if (db.client.topology.constructor.name !== 'ReplSet') {
          this.skip();
        }
      }).
      then(() => new Promise((resolve, reject) => {
        start.mongodVersion(function(err, version) {
          if (err) {
            return reject(err);
          }
          resolve(version);
        });
      })).
      then(version => {
        if (version[0] < 4) {
          this.skip();
        }
      }).
      catch(() => {
        this.skip()
      });
  });

  it('basic example', function() {
    const Customer = db.model('Customer', new Schema({ name: String }));

    let session = null;
    return db.createCollection('customers').
      then(() => db.startSession()).
      then(_session => {
        session = _session;
        // Start a transaction
        session.startTransaction();
        // This `create()` is part of the transaction because of the `session`
        // option.
        return Customer.create([{ name: 'Test' }], { session: session });
      }).
      // Transactions execute in isolation, so unless you pass a `session`
      // to `findOne()` you won't see the document until the transaction
      // is committed.
      then(() => Customer.findOne({ name: 'Test' })).
      then(doc => assert.ok(!doc)).
      // This `findOne()` will return the doc, because passing the `session`
      // means this `findOne()` will run as part of the transaction.
      then(() => Customer.findOne({ name: 'Test' }).session(session)).
      then(doc => assert.ok(doc)).
      // Once the transaction is committed, the write operation becomes
      // visible outside of the transaction.
      then(() => session.commitTransaction()).
      then(() => Customer.findOne({ name: 'Test' })).
      then(doc => assert.ok(doc));
  });

  it('save', function() {
    const User = db.model('User', new Schema({ name: String }));

    let session = null;
    return db.createCollection('users').
      then(() => db.startSession()).
      then(_session => {
        session = _session;
        return User.create({ name: 'foo' });
      }).
      then(() => {
        session.startTransaction();
        return User.findOne({ name: 'foo' }).session(session);
      }).
      then(user => {
        // Getter/setter for the session associated with this document.
        assert.ok(user.$session());
        user.name = 'bar';
        // By default, `save()` uses the associated session
        return user.save();
      }).
      then(() => User.findOne({ name: 'bar' })).
      // Won't find the doc because `save()` is part of an uncommitted transaction
      then(doc => assert.ok(!doc)).
      then(() => {
        session.commitTransaction();
        return User.findOne({ name: 'bar' });
      }).
      then(doc => assert.ok(doc));
  });
});
