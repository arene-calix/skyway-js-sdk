'use strict';

const MediaConnection = require('../src/mediaConnection');
const DataConnection  = require('../src/dataConnection');
const SFURoom         = require('../src/sfuRoom');
const MeshRoom        = require('../src/meshRoom');
const util            = require('../src/util');
const Socket          = require('../src/socket');

const assert       = require('power-assert');
const proxyquire   = require('proxyquireify')(require);
const sinon        = require('sinon');
const EventEmitter = require('events');

const MediaStream = window.MediaStream || window.webkitMediaStream;

describe('Peer', () => {
  const apiKey = 'abcdefgh-1234-5678-jklm-zxcvasdfqwrt';
  const peerId = 'testPeerId';
  const timeForAsync = 10;
  let SocketConstructorStub;
  let SFURoomConstructorStub;
  let MeshRoomConstructorStub;

  let socketInstanceStub;
  let sfuRoomInstanceStub;
  let meshRoomInstanceStub;

  let Peer;
  let initializeServerConnectionSpy;

  beforeEach(() => {
    // new Socket should return a stubbed socket object
    SocketConstructorStub = sinon.stub(Socket, 'constructor');
    socketInstanceStub = sinon.createStubInstance(Socket);
    SocketConstructorStub.returns(socketInstanceStub);

    // new SFURoom should return a stubbed socket object
    SFURoomConstructorStub = sinon.stub(SFURoom, 'constructor');
    sfuRoomInstanceStub = sinon.createStubInstance(SFURoom);
    SFURoomConstructorStub.returns(sfuRoomInstanceStub);

    // new MeshRoom should return a stubbed socket object
    MeshRoomConstructorStub = sinon.stub(MeshRoom, 'constructor');
    meshRoomInstanceStub = sinon.createStubInstance(MeshRoom);
    MeshRoomConstructorStub.returns(meshRoomInstanceStub);

    // EventEmitter functions should be spies not stubs so we can test them properly
    socketInstanceStub.on.restore();
    socketInstanceStub.emit.restore();
    sinon.spy(socketInstanceStub, 'on');
    sinon.spy(socketInstanceStub, 'emit');

    sfuRoomInstanceStub.on.restore();
    sfuRoomInstanceStub.emit.restore();
    sinon.spy(sfuRoomInstanceStub, 'on');
    sinon.spy(sfuRoomInstanceStub, 'emit');

    meshRoomInstanceStub.on.restore();
    meshRoomInstanceStub.emit.restore();
    sinon.spy(meshRoomInstanceStub, 'on');
    sinon.spy(meshRoomInstanceStub, 'emit');

    Peer = proxyquire('../src/peer', {
      './socket':   SocketConstructorStub,
      './sfuRoom':  SFURoomConstructorStub,
      './meshRoom': MeshRoomConstructorStub,
      './util':     util});
    initializeServerConnectionSpy = sinon.spy(Peer.prototype, '_initializeServerConnection');
  });

  afterEach(() => {
    SocketConstructorStub.restore();
    SFURoomConstructorStub.restore();
    MeshRoomConstructorStub.restore();

    initializeServerConnectionSpy.restore();
  });

  describe('Constructor', () => {
    it('should create a Peer object', () => {
      const peer = new Peer({
        key: apiKey
      });
      assert(peer);
      assert(peer instanceof Peer);
    });

    it('should create a Peer object with default options', () => {
      const peer = new Peer({
        key: apiKey
      });

      assert.equal(peer.options.debug.value, util.LOG_LEVELS.NONE.value);
      assert.equal(peer.options.host, util.CLOUD_HOST);
      assert.equal(peer.options.port, util.CLOUD_PORT);
      assert(peer.options.token);
      assert.equal(typeof peer.options.token, 'string');
      assert.deepEqual(peer.options.config, util.defaultConfig);
      assert.equal(peer.options.turn, true);
    });

    it('should create a Peer object with options overwritten', () => {
      const config = {iceServers: []};
      const peer = new Peer({
        key:    apiKey,
        debug:  util.LOG_LEVELS.FULL,
        config: config
      });
      // Overwritten
      assert.equal(peer.options.key, apiKey);
      assert.equal(peer.options.debug, util.LOG_LEVELS.FULL);
      assert.equal(peer.options.config, config);

      // Default unchanged
      assert.equal(peer.options.host, util.CLOUD_HOST);
      assert.equal(peer.options.port, util.CLOUD_PORT);
      assert.equal(typeof peer.options.token, 'string');
      assert.equal(peer.options.turn, true);
    });

    it('should not create a Peer object with invalid ID', done => {
      let peer;
      try {
        peer = new Peer('間違ったIDです', {
          key: apiKey
        });
      } catch (e) {
        assert.equal(peer, undefined);
        done();
      }
    });

    it('should not create a Peer object with invalid API key', done => {
      let peer;
      try {
        peer = new Peer({
          key: 'wrong'
        });
      } catch (e) {
        assert.equal(peer, undefined);
        done();
      }
    });

    it('should call _initializeServerConnection with passed id', () => {
      // eslint-disable-next-line no-new
      new Peer(peerId, {
        key: apiKey
      });

      assert.equal(initializeServerConnectionSpy.callCount, 1);
      assert(initializeServerConnectionSpy.calledWith(peerId));
    });

    it('should call _initializeServerConnection with undefined if id is not specified', () => {
      // eslint-disable-next-line no-new
      new Peer({
        key: apiKey
      });

      assert.equal(initializeServerConnectionSpy.callCount, 1);
      assert(initializeServerConnectionSpy.calledWith(undefined));
    });

    // This can't be separated out because it is called in the constructor
    describe('_initializeServerConnection', () => {
      let peer;
      beforeEach(() => {
        socketInstanceStub.on.restore();
        socketInstanceStub.emit.restore();

        peer = new Peer(peerId, {
          key: apiKey
        });
      });

      it('should create a new Socket and set it to peer.socket', () => {
        assert.equal(SocketConstructorStub.callCount, 1);
        assert(SocketConstructorStub.calledWith(
          peer.options.secure,
          peer.options.host,
          peer.options.port,
          peer.options.key));
        assert.equal(peer.socket.constructor.name, 'Socket');
      });

      it('should abort on a socket \'error\'', done => {
        const errMsg = 'test error';

        peer.on('error', err => {
          assert.equal(err.type, 'socket-error');
          assert.equal(err.message, errMsg);
          done();
        });

        peer.socket.emit('error', errMsg);
      });

      it('should abort and disconnect on a socket \'disconnect\' event', done => {
        const disconnectSpy = sinon.spy(peer, 'disconnect');

        peer.on('error', err => {
          assert.equal(err.type, 'socket-error');
          assert.equal(err.message, 'Lost connection to server.');

          assert.equal(disconnectSpy.callCount, 1);
          disconnectSpy.restore();
          done();
        });

        peer.socket.emit('disconnect');
      });

      it('should call destroy onbeforeunload', () => {
        window.onbeforeunload();
        assert.equal(peer._destroyCalled, true);
      });

      it('should call socket.start', () => {
        assert.equal(peer.socket.start.callCount, 1);
        assert(peer.socket.start.calledWith(peerId, peer.options.token));
      });
    });
  });

  describe('disconnect', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    afterEach(() => {
      peer.destroy();
    });

    it('should emit "disconnected" event on peer', done => {
      peer.disconnect();
      peer.on('disconnected', id => {
        assert.equal(peer.id, id);
        done();
      });
    });

    it('should set _disconnectCalled to true and open to false', done => {
      peer.disconnect();
      peer.on('disconnected', () => {
        assert.equal(peer._disconnectCalled, true);
        assert.equal(peer.open, false);
        done();
      });
    });

    it('should call socket.close', done => {
      peer.disconnect();

      peer.on('disconnected', () => {
        assert.equal(peer.socket.close.callCount, 1);
        done();
      });
    });

    it('should not do anything the second time you call it', function(done) {
      peer.disconnect();

      let disconnectEventCount = 0;
      let beforeTestTimeout = this.timeout - 100;

      setTimeout(() => {
        assert.equal(disconnectEventCount, 1);
        done();
      }, beforeTestTimeout);

      peer.on('disconnected', () => {
        assert.equal(++disconnectEventCount, 1);
        peer.disconnect();
      });
    });

    it('should set _lastPeerId to current id and id to null', done => {
      peer.disconnect();

      peer.on('disconnected', id => {
        setTimeout(() => {
          assert.equal(peer._lastPeerId, id);
          assert.equal(peer.id, null);
          done();
        }, timeForAsync);
      });
    });
  });

  describe('destroy', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    afterEach(() => {
      peer.destroy();
    });

    it('should call disconnect()', () => {
      const spy = sinon.spy(peer, 'disconnect');

      peer.destroy();

      assert.equal(spy.callCount, 1);

      spy.restore();
    });

    it('should set _destroyCalled to true', done => {
      peer.destroy();

      peer.on('disconnected', () => {
        assert.equal(peer._destroyCalled, true);
        done();
      });
    });

    it('should not call disconnect() the second time you call it', () => {
      const spy = sinon.spy(peer, 'disconnect');

      peer.destroy();
      peer.destroy();

      assert.equal(spy.callCount, 1);

      spy.restore();
    });

    it('should call _cleanupPeer for each peer in peer.connections', () => {
      const peerIds = [];
      const numPeers = 10;
      for (let peerIndex = 0; peerIndex < numPeers; peerIndex++) {
        const peerId = util.randomToken();
        peerIds.push(peerId);
        peer.connections[peerId] = [];
      }

      const stub = sinon.stub(peer, '_cleanupPeer');
      peer.destroy();

      assert.equal(stub.callCount, peerIds.length);
      for (let peerId of peerIds) {
        assert(stub.calledWith(peerId));
      }

      stub.restore();
    });
  });

  describe('getConnection', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    afterEach(() => {
      peer.disconnect();
    });

    it('should get a connection if peerId and connId match', () => {
      const peerId = 'testId';
      const connection = new DataConnection(peerId, {});

      peer._addConnection(peerId, connection);

      assert.equal(peer.getConnection(peerId, connection.id), connection);
    });

    it('should return null if connection doesn\'t exist', () => {
      const peerId = 'testId';
      const connection = new DataConnection(peerId, {});

      assert.equal(peer.getConnection(peerId, connection.id), null);
    });
  });

  describe('_cleanupPeer', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    afterEach(() => {
      peer.destroy();
    });

    it('should call close for each connection in the peer', () => {
      const peerId = util.randomToken();
      peer.connections[peerId] = [];

      const spies = [];
      const numConns = 5;
      for (let connIndex = 0; connIndex < numConns; connIndex++) {
        const spy = sinon.spy();
        spies.push(spy);
        peer.connections[peerId].push({close: spy});
      }

      assert.equal(spies.length, numConns);
      assert.equal(peer.connections[peerId].length, numConns);

      peer._cleanupPeer(peerId);
      for (let spy of spies) {
        assert.equal(spy.callCount, 1);
      }
    });
  });

  describe('_setupMessageHandlers', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    afterEach(() => {
      peer.destroy();
    });

    describe('general peer messages', () => {
      describe('OPEN', () => {
        it('should set peer.id and peer.open', () => {
          assert.equal(peer.id, undefined);

          const peerId = 'testId';
          const openMessage = {peerId: peerId};
          peer.socket.emit(util.MESSAGE_TYPES.OPEN.key, openMessage);

          assert.equal(peer.id, peerId);
          assert.equal(peer.open, true);
        });

        it('should add turn servers if credentials are defined', () => {
          assert.equal(peer.id, undefined);

          const openMessage = {peerId: peerId, turnCredential: 'password'};

          const defaultIceServersLength = util.defaultConfig.iceServers.length;
          assert.equal(peer.options.config.iceServers.length, defaultIceServersLength);
          assert.equal(peer._pcConfig, undefined);

          peer.socket.emit(util.MESSAGE_TYPES.OPEN.key, openMessage);

          // 3 servers added: 'turn-udp', 'turn-tcp', 'turns-tcp'
          assert.equal(peer._pcConfig.iceServers.length, defaultIceServersLength + 3);
        });

        it('should not add turn servers if credentials aren\'t defined', () => {
          assert.equal(peer.id, undefined);

          const openMessage = {peerId: peerId};

          const defaultIceServersLength = util.defaultConfig.iceServers.length;
          assert.equal(peer.options.config.iceServers.length, defaultIceServersLength);
          assert.equal(peer._pcConfig, undefined);

          peer.socket.emit(util.MESSAGE_TYPES.OPEN.key, openMessage);

          // 3 servers added: 'turn-udp', 'turn-tcp', 'turns-tcp'
          assert.equal(peer._pcConfig.iceServers.length, defaultIceServersLength);
        });

        it('should emit an open event', done => {
          const openMessage = {peerId: peerId};
          peer.on(Peer.EVENTS.open.key, newPeerId => {
            assert.equal(newPeerId, peerId);
            done();
          });

          peer.socket.emit(util.MESSAGE_TYPES.OPEN.key, openMessage);
        });
      });

      describe('ERROR', () => {
        it('should call abort with server-error', () => {
          const abortStub = sinon.stub(peer, '_abort');

          const error = {
            type:    'error-type',
            message: 'error message'
          };
          peer.socket.emit(util.MESSAGE_TYPES.ERROR.key, error);

          assert(abortStub.calledWith(error.type, error.message));
        });
      });
    });

    describe('P2P messages', () => {
      describe('LEAVE', () => {
        let logSpy;

        beforeEach(() => {
          logSpy = sinon.spy(util, 'log');
        });
        afterEach(() => {
          logSpy.restore();
        });

        it('should log a message', () => {
          peer.socket.emit(util.MESSAGE_TYPES.LEAVE.key, peerId);

          assert.equal(logSpy.callCount, 1);
          assert(logSpy.calledWith(`Received leave message from ${peerId}`));
        });

        it('should call _cleanupPeer', () => {
          const cleanupStub = sinon.stub(peer, '_cleanupPeer');

          peer.socket.emit(util.MESSAGE_TYPES.LEAVE.key, peerId);

          assert.equal(cleanupStub.callCount, 1);
          assert(cleanupStub.calledWith(peerId));
        });
      });

      describe('EXPIRE', () => {
        it('should emit a peer-unavailable error', done => {
          // listen for event instead of stubbing util.emitError
          // so we can make sure that using `call` to pass the context works
          peer.on(Peer.EVENTS.error.key, e => {
            assert.equal(e.type, 'peer-unavailable');
            assert.equal(e.message, `Could not connect to peer ${peerId}`);
            done();
          });

          peer.socket.emit(util.MESSAGE_TYPES.EXPIRE.key, peerId);
        });
      });

      describe('OFFER', () => {
        it('should create MediaConnection on media OFFER events', done => {
          const connectionId = util.randomToken();
          peer.on(Peer.EVENTS.call.key, connection => {
            assert(connection);
            assert.equal(connection.constructor.name, 'MediaConnection');
            assert.equal(connection._options.connectionId, connectionId);
            assert.equal(Object.keys(peer.connections[peerId]).length, 1);
            assert.equal(peer.getConnection(peerId, connection.id), connection);
            done();
          });

          const offerMsg = {
            connectionType: 'media',
            connectionId:   connectionId,
            src:            peerId,
            metadata:       {}
          };
          peer.socket.emit(util.MESSAGE_TYPES.OFFER.key, offerMsg);
        });

        it('should create DataConnection on data OFFER events', done => {
          const connectionId = util.randomToken();
          peer.on(Peer.EVENTS.connection.key, connection => {
            assert(connection);
            assert.equal(connection.constructor.name, 'DataConnection');
            assert.equal(connection._options.connectionId, connectionId);
            assert.equal(Object.keys(peer.connections[peerId]).length, 1);
            assert.equal(peer.getConnection(peerId, connection.id), connection);

            done();
          });

          const offerMsg = {
            connectionType: 'data',
            connectionId:   connectionId,
            src:            peerId,
            metadata:       {}
          };
          peer.socket.emit(util.MESSAGE_TYPES.OFFER.key, offerMsg);
        });

        it('should not create a connection if connectType is invalid', () => {
          const connectionId = util.randomToken();

          const offerMsg = {
            connectionType: undefined,
            connectionId:   connectionId,
            src:            peerId,
            metadata:       {}
          };
          peer.socket.emit(util.MESSAGE_TYPES.OFFER.key, offerMsg);

          assert.equal(peer.connections[peerId], undefined);
        });

        it('should not create a connection if connectionId already exists', done => {
          const connectionId = util.randomToken();

          const offerMsg = {
            connectionType: 'media',
            connectionId:   connectionId,
            src:            peerId,
            metadata:       {}
          };
          peer.socket.emit(util.MESSAGE_TYPES.OFFER.key, offerMsg);
          peer.socket.emit(util.MESSAGE_TYPES.OFFER.key, offerMsg);

          setTimeout(() => {
            assert.equal(Object.keys(peer.connections[peerId]).length, 1);
            done();
          });
        });
      });

      describe('ANSWER', () => {
        it('should call handleAnswer if connection exists', () => {
          // The connection type doesn't matter so just test one
          const mediaConnection = new MediaConnection('remoteId', {});
          const srcId  = 'srcId';
          const mediaAnswerMessage = {
            src:            srcId,
            dst:            'remoteId',
            answer:         {},
            connectionId:   mediaConnection.id,
            connectionType: 'media'
          };

          const stub = sinon.stub(mediaConnection, 'handleAnswer');

          peer._addConnection(srcId, mediaConnection);

          peer.socket.emit(util.MESSAGE_TYPES.ANSWER.key, mediaAnswerMessage);
          assert.equal(stub.callCount, 1);
          assert(stub.calledWith(mediaAnswerMessage));
        });

        it('should queue ANSWERs if connection doesn\'t exist', () => {
          const connId1 = 'connId1';
          const connId2 = 'connId2';
          const mediaAnswerMessage = {
            src:            'id1',
            dst:            'id2',
            answer:         {},
            connectionId:   connId1,
            connectionType: 'media'
          };
          const dataAnswerMessage = {
            src:            'id1',
            dst:            'id2',
            answer:         {},
            connectionId:   connId2,
            connectionType: 'data'
          };

          peer.socket.emit(
            util.MESSAGE_TYPES.ANSWER.key,
            mediaAnswerMessage);
          peer.socket.emit(
            util.MESSAGE_TYPES.ANSWER.key,
            dataAnswerMessage);

          const messages1 = peer._queuedMessages[connId1];

          assert.equal(messages1[0].type, util.MESSAGE_TYPES.ANSWER.key);
          assert.equal(messages1[0].payload, mediaAnswerMessage);

          const messages2 = peer._queuedMessages[connId2];

          assert.equal(messages2[0].type, util.MESSAGE_TYPES.ANSWER.key);
          assert.equal(messages2[0].payload, dataAnswerMessage);
        });
      });

      describe('CANDIDATE', () => {
        it('should call handleCandidate on CANDIDATE if connection exists', () => {
          // The connection type doesn't matter so just test one
          const dataConnection = new DataConnection('remoteId', {});
          const srcId  = 'srcId';
          const dataCandidateMessage = {
            src:            srcId,
            dst:            'remoteId',
            candidate:      {},
            connectionId:   dataConnection.id,
            connectionType: 'data'
          };

          const stub = sinon.stub(dataConnection, 'handleCandidate');

          peer._addConnection(srcId, dataConnection);

          peer.socket.emit(util.MESSAGE_TYPES.CANDIDATE.key, dataCandidateMessage);
          assert.equal(stub.callCount, 1);
          assert(stub.calledWith(dataCandidateMessage));
        });

        it('should queue CANDIDATEs if connection doesn\'t exist', () => {
          const connId1 = 'connId1';
          const connId2 = 'connId2';
          const mediaCandidateMessage = {
            src:            'id1',
            dst:            'id2',
            candidate:      {},
            connectionId:   connId1,
            connectionType: 'media'
          };
          const dataCandidateMessage = {
            src:            'id1',
            dst:            'id2',
            candidate:      {},
            connectionId:   connId2,
            connectionType: 'data'
          };

          peer.socket.emit(
            util.MESSAGE_TYPES.CANDIDATE.key,
            mediaCandidateMessage);
          peer.socket.emit(
            util.MESSAGE_TYPES.CANDIDATE.key,
            dataCandidateMessage);

          const messages1 = peer._queuedMessages[connId1];

          assert.equal(messages1[0].type, util.MESSAGE_TYPES.CANDIDATE.key);
          assert.equal(messages1[0].payload, mediaCandidateMessage);

          const messages2 = peer._queuedMessages[connId2];

          assert.equal(messages2[0].type, util.MESSAGE_TYPES.CANDIDATE.key);
          assert.equal(messages2[0].payload, dataCandidateMessage);
        });
      });
    });

    describe('SFU room messages', () => {
      const roomName = 'testroom';
      let sfuRoomStub;

      beforeEach(() => {
        sfuRoomStub = sinon.createStubInstance(SFURoom);
      });

      describe('SFU_USER_JOIN', () => {
        const joinMessage = {
          roomName: roomName
        };

        it('should call handleJoin if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.SFU_USER_JOIN.key, joinMessage);

          assert.equal(sfuRoomStub.handleJoin.callCount, 1);
          assert(sfuRoomStub.handleJoin.calledWith(joinMessage));
        });

        it('should not call handleJoin if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.SFU_USER_JOIN.key, joinMessage);

          assert.equal(sfuRoomStub.handleJoin.callCount, 0);
        });
      });

      describe('SFU_OFFER', () => {
        const offerMessage = {
          roomName: roomName,
          msids:    {},
          offer:    {}
        };

        it('should call handleOffer and updateMsidMap if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.SFU_OFFER.key, offerMessage);

          assert.equal(sfuRoomStub.handleOffer.callCount, 1);
          assert(sfuRoomStub.handleOffer.calledWith(offerMessage.offer));

          assert.equal(sfuRoomStub.updateMsidMap.callCount, 1);
          assert(sfuRoomStub.updateMsidMap.calledWith(offerMessage.msids));
        });

        it('should not call handleOffer and updateMsidMap if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.SFU_OFFER.key, offerMessage);

          assert.equal(sfuRoomStub.handleOffer.callCount, 0);
          assert.equal(sfuRoomStub.updateMsidMap.callCount, 0);
        });
      });

      describe('SFU_USER_LEAVE', () => {
        const leaveMessage = {
          roomName: roomName
        };
        it('should call handleLeave if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.SFU_USER_LEAVE.key, leaveMessage);

          assert.equal(sfuRoomStub.handleLeave.callCount, 1);
          assert(sfuRoomStub.handleLeave.calledWith(leaveMessage));
        });

        it('should not call handleLeave if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.SFU_USER_LEAVE.key, leaveMessage);

          assert.equal(sfuRoomStub.handleLeave.callCount, 0);
        });
      });

      describe('SFU_DATA', () => {
        const dataMessage = {
          roomName: roomName
        };
        it('should call handleData if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.SFU_DATA.key, dataMessage);

          assert.equal(sfuRoomStub.handleData.callCount, 1);
          assert(sfuRoomStub.handleData.calledWith(dataMessage));
        });

        it('should not call handleData if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.SFU_DATA.key, dataMessage);

          assert.equal(sfuRoomStub.handleData.callCount, 0);
        });
      });

      describe('SFU_LOG', () => {
        const logMessage = {
          roomName: roomName,
          log:      []
        };
        it('should call handleLog if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.SFU_LOG.key, logMessage);

          assert.equal(sfuRoomStub.handleLog.callCount, 1);
          assert(sfuRoomStub.handleLog.calledWith(logMessage.log));
        });

        it('should not call handleLog if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.SFU_LOG.key, logMessage);

          assert.equal(sfuRoomStub.handleLog.callCount, 0);
        });
      });
    });

    describe('Mesh room messages', () => {
      const roomName = 'testroom';
      let sfuRoomStub;

      beforeEach(() => {
        sfuRoomStub = sinon.createStubInstance(MeshRoom);
      });

      describe('MESH_USER_LIST', () => {
        describe('type is media', () => {
          const listMessage = {
            roomName: roomName,
            userList: [],
            type:     'media'
          };

          it('should call makeMediaConnections if room exists', () => {
            peer.rooms[roomName] = sfuRoomStub;

            peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_LIST.key, listMessage);

            assert.equal(sfuRoomStub.makeMediaConnections.callCount, 1);
            assert(sfuRoomStub.makeMediaConnections.calledWith(listMessage.userList));
          });

          it('should not call makeMediaConnections if room doesn\'t exist', () => {
            peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_LIST.key, listMessage);

            assert.equal(sfuRoomStub.makeMediaConnections.callCount, 0);
            assert.equal(sfuRoomStub.makeDataConnections.callCount, 0);
          });
        });

        describe('type is data', () => {
          const listMessage = {
            roomName: roomName,
            userList: [],
            type:     'data'
          };

          it('should call makeMediaConnections if room exists', () => {
            peer.rooms[roomName] = sfuRoomStub;

            peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_LIST.key, listMessage);

            assert.equal(sfuRoomStub.makeDataConnections.callCount, 1);
            assert(sfuRoomStub.makeDataConnections.calledWith(listMessage.userList));
          });

          it('should not call makeMediaConnections if room doesn\'t exist', () => {
            peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_LIST.key, listMessage);

            assert.equal(sfuRoomStub.makeMediaConnections.callCount, 0);
            assert.equal(sfuRoomStub.makeDataConnections.callCount, 0);
          });
        });
      });

      describe('MESH_USER_JOIN', () => {
        const joinMessage = {
          roomName: roomName
        };

        it('should call handleJoin if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_JOIN.key, joinMessage);

          assert.equal(sfuRoomStub.handleJoin.callCount, 1);
          assert(sfuRoomStub.handleJoin.calledWith(joinMessage));
        });

        it('should not call handleJoin if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_JOIN.key, joinMessage);

          assert.equal(sfuRoomStub.handleJoin.callCount, 0);
        });
      });

      describe('MESH_OFFER', () => {
        const offerMessage = {
          roomName: roomName
        };

        it('should call handleOffer if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.MESH_OFFER.key, offerMessage);

          assert.equal(sfuRoomStub.handleOffer.callCount, 1);
          assert(sfuRoomStub.handleOffer.calledWith(offerMessage));
        });

        it('should not call handleOffer if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.MESH_OFFER.key, offerMessage);

          assert.equal(sfuRoomStub.handleOffer.callCount, 0);
        });
      });

      describe('MESH_ANSWER', () => {
        const answerMessage = {
          roomName: roomName
        };

        it('should call handleAnswer if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.MESH_ANSWER.key, answerMessage);

          assert.equal(sfuRoomStub.handleAnswer.callCount, 1);
          assert(sfuRoomStub.handleAnswer.calledWith(answerMessage));
        });

        it('should not call handleAnswer if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.MESH_ANSWER.key, answerMessage);

          assert.equal(sfuRoomStub.handleAnswer.callCount, 0);
        });
      });

      describe('MESH_CANDIDATE', () => {
        const candidateMessage = {
          roomName: roomName
        };

        it('should call handleCandidate if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.MESH_CANDIDATE.key, candidateMessage);

          assert.equal(sfuRoomStub.handleCandidate.callCount, 1);
          assert(sfuRoomStub.handleCandidate.calledWith(candidateMessage));
        });

        it('should not call handleCandidate if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.MESH_CANDIDATE.key, candidateMessage);

          assert.equal(sfuRoomStub.handleCandidate.callCount, 0);
        });
      });

      describe('MESH_DATA', () => {
        const dataMessage = {
          roomName: roomName
        };

        it('should call handleData if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.MESH_DATA.key, dataMessage);

          assert.equal(sfuRoomStub.handleData.callCount, 1);
          assert(sfuRoomStub.handleData.calledWith(dataMessage));
        });

        it('should not call handleData if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.MESH_DATA.key, dataMessage);

          assert.equal(sfuRoomStub.handleData.callCount, 0);
        });
      });

      describe('MESH_LOG', () => {
        const logMessage = {
          roomName: roomName,
          log:      []
        };

        it('should call handleLog if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.MESH_LOG.key, logMessage);

          assert.equal(sfuRoomStub.handleLog.callCount, 1);
          assert(sfuRoomStub.handleLog.calledWith(logMessage.log));
        });

        it('should not call handleLog if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.MESH_LOG.key, logMessage);

          assert.equal(sfuRoomStub.handleLog.callCount, 0);
        });
      });

      describe('MESH_USER_LEAVE', () => {
        const leaveMessage = {
          roomName: roomName
        };

        it('should call handleLeave if room exists', () => {
          peer.rooms[roomName] = sfuRoomStub;

          peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_LEAVE.key, leaveMessage);

          assert.equal(sfuRoomStub.handleLeave.callCount, 1);
          assert(sfuRoomStub.handleLeave.calledWith(leaveMessage));
        });

        it('should not call handleLeave if room doesn\'t exist', () => {
          peer.socket.emit(util.MESSAGE_TYPES.MESH_USER_LEAVE.key, leaveMessage);

          assert.equal(sfuRoomStub.handleLeave.callCount, 0);
        });
      });
    });
  });

  describe('call', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    afterEach(() => {
      peer.destroy();
    });

    it('should create a new MediaConnection, add it, and return it', () => {
      const _addConnectionSpy = sinon.spy(peer, '_addConnection');

      const conn = peer.call(peerId, new MediaStream());

      assert.equal(conn.constructor.name, 'MediaConnection');
      assert.equal(_addConnectionSpy.callCount, 1);
      assert(_addConnectionSpy.calledWith(peerId, conn));

      _addConnectionSpy.restore();
    });

    it('should emit an error if disconnected', done => {
      peer.on('error', e => {
        assert.equal(e.type, 'disconnected');
        done();
      });

      peer.disconnect();

      setTimeout(() => {
        peer.call(peerId, {});
      });
    });
  });

  describe('connect', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    afterEach(() => {
      peer.destroy();
    });

    it('should create a new DataConnection, add it, and return it', () => {
      const addConnectionSpy = sinon.spy(peer, '_addConnection');

      const conn = peer.connect(peerId, {});

      assert.equal(conn.constructor.name, 'DataConnection');
      assert.equal(addConnectionSpy.callCount, 1);
      assert(addConnectionSpy.calledWith(peerId, conn));

      addConnectionSpy.restore();
    });

    it('should emit an error if disconnected', done => {
      peer.on('error', e => {
        assert.equal(e.type, 'disconnected');
        done();
      });

      peer.disconnect();

      setTimeout(() => {
        peer.connect(peerId);
      });
    });
  });

  describe('joinRoom', () => {
    const roomName = 'testRoomName';

    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    it('should call _initSfuRoom if mode is \'sfu\'', () => {
      const initSfuRoomStub = sinon.stub(peer, '_initSfuRoom');
      const options = {mode: 'sfu'};

      peer.joinRoom(roomName, options);

      assert.equal(initSfuRoomStub.callCount, 1);
      assert(initSfuRoomStub.calledWith(roomName, options));
    });

    it('should call _initFullMeshRoom if mode is \'mesh\'', () => {
      const initMeshRoomStub = sinon.stub(peer, '_initFullMeshRoom');
      const options = {mode: 'mesh'};

      peer.joinRoom(roomName, options);

      assert.equal(initMeshRoomStub.callCount, 1);
      assert(initMeshRoomStub.calledWith(roomName, options));
    });

    it('should call _initFullMeshRoom if mode is not set', () => {
      const initMeshRoomStub = sinon.stub(peer, '_initFullMeshRoom');
      const options = {};

      peer.joinRoom(roomName, options);

      assert.equal(initMeshRoomStub.callCount, 1);
      assert(initMeshRoomStub.calledWith(roomName, options));
    });

    it('should emit an error if roomName isn\'t defined', done => {
      const options = {};

      peer.on('error', err => {
        assert.equal(err.type, 'room-error');
        done();
      });

      peer.joinRoom(undefined, options);
    });

    it('should set roomOptions pcConfig and peerId', () => {
      const initMeshRoomStub = sinon.stub(peer, '_initFullMeshRoom');
      const options = {};

      peer.joinRoom(roomName, options);

      const roomOptions = initMeshRoomStub.args[0][1];
      assert.equal(roomOptions.pcConfig, peer._pcConfig);
      assert.equal(roomOptions.peerId, peer.id);
    });
  });

  describe('listAllPeers', () => {
    let peer;
    let requests = [];
    let xhr;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });

      xhr = sinon.useFakeXMLHttpRequest();
      xhr.onCreate = function(request) {
        requests.push(request);
      };
    });

    afterEach(() => {
      xhr.restore();
      requests = [];

      peer.destroy();
    });

    it('should send a "GET" request to the right URL', () => {
      peer.listAllPeers();
      assert.equal(requests.length, 1);

      const protocol = peer.options.secure ? 'https://' : 'http://';
      const url = `${protocol}${peer.options.host}:` +
        `${peer.options.port}/api/apikeys/${apiKey}/clients/`;
      assert(requests[0].url === url);
      assert(requests[0].method === 'get');
    });

    it('should call the callback with the response as the argument', () => {
      const spy = sinon.spy();
      peer.listAllPeers(spy);
      assert.equal(requests.length, 1);

      const peerList = ['peerId1', 'peerId2', 'peerId3'];
      requests[0].respond(200, {}, JSON.stringify(peerList));

      assert.equal(spy.callCount, 1);
      assert(spy.calledWith(peerList));
    });

    it('should throw an error when the status is 401', () => {
      try {
        peer.listAllPeers();
        requests.respond(401);
      } catch (e) {
        assert(e instanceof Error);
        return;
      }

      assert.fail('Didn\'t throw an error');
    });

    it('should call the callback with an empty array any other status', () => {
      const spy = sinon.spy();
      const peerList = JSON.stringify(['peerId1', 'peerId2', 'peerId3']);
      const responseCodes = [202, 400, 403, 404, 408, 500, 503];

      for (let codeIndex = 0; codeIndex <= responseCodes.length; codeIndex++) {
        peer.listAllPeers(spy);
        requests[codeIndex].respond(responseCodes[codeIndex], {}, peerList);
      }

      assert.equal(spy.withArgs([]).callCount, responseCodes.length);
    });

    it('should not throw an error if cb isn\'t provided', () => {
      try {
        peer.listAllPeers();
        requests[0].respond(200, {}, JSON.stringify([]));
      } catch (e) {
        assert.fail('Should not have thrown an error');
      }
    });

    // onerror testing is unstable. Wait for sinonjs2 to be released
    it.skip('should throw an error on peer if http request fails', done => {
      peer.on('error', err => {
        assert(err instanceof Error);
        assert.equal(err.type, 'server-error');
        done();
      });

      peer.listAllPeers();
      requests[0].abort();
    });
  });

  describe('_initSfuRoom', () => {
    const peerId = 'testPeerId';
    const roomName = 'testRoomName';
    const options = {};
    let peer;

    beforeEach(() => {
      peer = new Peer(peerId, {
        key: apiKey
      });
      peer.id = peerId;
    });

    it('should create and return SFURoom', () => {
      const sfuRoom = peer._initSfuRoom(roomName, options);

      assert.equal(SFURoomConstructorStub.callCount, 1);
      assert(SFURoomConstructorStub.calledWith(roomName, peerId, options));

      assert.equal(sfuRoom.constructor.name, 'SFURoom');
      assert.equal(peer.rooms[roomName], sfuRoom);
    });

    it('should set call _setupSFURoomMessageHandlers', () => {
      const setupSFUMessageHandlersSpy = sinon.spy(peer, '_setupSFURoomMessageHandlers');
      const sfuRoom = peer._initSfuRoom(roomName, options);

      assert.equal(setupSFUMessageHandlersSpy.callCount, 1);
      assert(setupSFUMessageHandlersSpy.calledWith(sfuRoom));
    });

    it('should send a SFU_JOIN message', () => {
      peer._initSfuRoom(roomName, options);

      assert.equal(peer.socket.send.callCount, 1);
      assert(peer.socket.send.calledWithMatch(
        util.MESSAGE_TYPES.SFU_JOIN.key,
        {roomName: roomName, roomOptions: options})
      );
    });

    it('should call sfuRoom.call() if stream option is set', () => {
      const optionsWithStream = {stream: {}};
      const sfuRoom = peer._initSfuRoom(roomName, optionsWithStream);

      assert.equal(sfuRoom.call.callCount, 1);
    });

    it('should not call sfuRoom.call() if stream option is not set', () => {
      const sfuRoom = peer._initSfuRoom(roomName, options);

      assert.equal(sfuRoom.call.callCount, 0);
    });

    it('should return the room if it exists', () => {
      const dummyRoom = {};
      peer.rooms[roomName] = dummyRoom;

      const sfuRoom = peer._initSfuRoom(roomName, options);

      assert.equal(sfuRoom, dummyRoom);
      assert.equal(SFURoomConstructorStub.callCount, 0);
    });
  });

  describe('_initFullMeshRoom', () => {
    const peerId = 'testPeerId';
    const roomName = 'testRoomName';
    const options = {};
    let peer;

    beforeEach(() => {
      peer = new Peer(peerId, {
        key: apiKey
      });
      peer.id = peerId;
    });

    it('should create and return MeshRoom', () => {
      const meshRoom = peer._initFullMeshRoom(roomName, options);

      assert.equal(MeshRoomConstructorStub.callCount, 1);
      assert(MeshRoomConstructorStub.calledWith(roomName, peerId, options));

      assert.equal(meshRoom.constructor.name, 'MeshRoom');
      assert.equal(peer.rooms[roomName], meshRoom);
    });

    it('should set call _setupMeshRoomMessageHandlers', () => {
      const setupSFUMessageHandlersSpy = sinon.spy(peer, '_setupMeshRoomMessageHandlers');
      const meshRoom = peer._initFullMeshRoom(roomName, options);

      assert.equal(setupSFUMessageHandlersSpy.callCount, 1);
      assert(setupSFUMessageHandlersSpy.calledWith(meshRoom));
    });

    it('should send a MESH_JOIN message', () => {
      peer._initFullMeshRoom(roomName, options);

      assert.equal(peer.socket.send.callCount, 1);
      assert(peer.socket.send.calledWithMatch(
        util.MESSAGE_TYPES.MESH_JOIN.key,
        {roomName: roomName, roomOptions: options})
      );
    });

    it('should call meshRoom.call() if stream option is set', () => {
      const optionsWithStream = {stream: {}};
      const meshRoom = peer._initFullMeshRoom(roomName, optionsWithStream);

      assert.equal(meshRoom.call.callCount, 1);
    });

    it('should not call meshRoom.call() if stream option is not set', () => {
      const meshRoom = peer._initFullMeshRoom(roomName, options);

      assert.equal(meshRoom.call.callCount, 0);
    });

    it('should return the room if it exists', () => {
      const dummyRoom = {};
      peer.rooms[roomName] = dummyRoom;

      const meshRoom = peer._initFullMeshRoom(roomName, options);

      assert.equal(meshRoom, dummyRoom);
      assert.equal(MeshRoomConstructorStub.callCount, 0);
    });
  });

  describe('_setupSFURoomMessageHandlers', () => {
    const roomName = 'testRoomName';
    const message = {};

    let peer;
    let sfuRoom;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
      sfuRoom = new SFURoomConstructorStub();
      sfuRoom.name = roomName;

      peer.rooms[roomName] = sfuRoom;
      peer._setupSFURoomMessageHandlers(sfuRoom);
    });

    it('should set up handlers for SFURoom Message events', () => {
      assert(sfuRoom.on.calledWith(SFURoom.MESSAGE_EVENTS.offerRequest.key, sinon.match.func));
      assert(sfuRoom.on.calledWith(SFURoom.MESSAGE_EVENTS.answer.key, sinon.match.func));
      assert(sfuRoom.on.calledWith(SFURoom.MESSAGE_EVENTS.broadcast.key, sinon.match.func));
      assert(sfuRoom.on.calledWith(SFURoom.MESSAGE_EVENTS.getLog.key, sinon.match.func));
      assert(sfuRoom.on.calledWith(SFURoom.MESSAGE_EVENTS.leave.key, sinon.match.func));
    });

    describe('offerRequest', () => {
      it('should send SFU_OFFER_REQUEST message', () => {
        sfuRoom.emit(SFURoom.MESSAGE_EVENTS.offerRequest.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.SFU_OFFER_REQUEST.key, message));
      });
    });

    describe('answer', () => {
      it('should send SFU_ANSWER message', () => {
        sfuRoom.emit(SFURoom.MESSAGE_EVENTS.answer.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.SFU_ANSWER.key, message));
      });
    });

    describe('broadcast', () => {
      it('should send SFU_DATA message', () => {
        sfuRoom.emit(SFURoom.MESSAGE_EVENTS.broadcast.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.SFU_DATA.key, message));
      });
    });

    describe('getLog', () => {
      it('should send SFU_LOG message', () => {
        sfuRoom.emit(SFURoom.MESSAGE_EVENTS.getLog.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.SFU_LOG.key, message));
      });
    });

    describe('leave', () => {
      it('should send SFU_LEAVE message', () => {
        sfuRoom.emit(SFURoom.MESSAGE_EVENTS.leave.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.SFU_LEAVE.key, message));
      });

      it('should delete room from peer.rooms', () => {
        sfuRoom.emit(SFURoom.MESSAGE_EVENTS.leave.key, message);

        assert.equal(peer.rooms[roomName], undefined);
      });
    });
  });

  describe('_setupMeshRoomMessageHandlers', () => {
    const roomName = 'testRoomName';
    const message = {};

    let peer;
    let meshRoom;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
      meshRoom = new MeshRoomConstructorStub();
      meshRoom.name = roomName;

      peer.rooms[roomName] = meshRoom;
      peer._setupMeshRoomMessageHandlers(meshRoom);
    });

    it('should set up handlers for MeshRoom Message events', () => {
      assert(meshRoom.on.calledWith(MeshRoom.MESSAGE_EVENTS.offer.key, sinon.match.func));
      assert(meshRoom.on.calledWith(MeshRoom.MESSAGE_EVENTS.answer.key, sinon.match.func));
      assert(meshRoom.on.calledWith(MeshRoom.MESSAGE_EVENTS.candidate.key, sinon.match.func));
      assert(meshRoom.on.calledWith(MeshRoom.MESSAGE_EVENTS.getPeers.key, sinon.match.func));
      assert(meshRoom.on.calledWith(MeshRoom.MESSAGE_EVENTS.broadcastByWS.key, sinon.match.func));
      assert(meshRoom.on.calledWith(MeshRoom.MESSAGE_EVENTS.getLog.key, sinon.match.func));
      assert(meshRoom.on.calledWith(MeshRoom.MESSAGE_EVENTS.leave.key, sinon.match.func));
    });

    describe('offer', () => {
      it('should send MESH_OFFER message', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.offer.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.MESH_OFFER.key, message));
      });
    });

    describe('answer', () => {
      it('should send MESH_ANSWER message', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.answer.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.MESH_ANSWER.key, message));
      });
    });

    describe('candidate', () => {
      it('should send MESH_CANDIDATE message', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.candidate.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.MESH_CANDIDATE.key, message));
      });
    });

    describe('getPeers', () => {
      it('should send MESH_USER_LIST_REQUEST message', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.getPeers.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.MESH_USER_LIST_REQUEST.key, message));
      });
    });

    describe('broadcastByWS', () => {
      it('should send MESH_DATA message', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.broadcastByWS.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.MESH_DATA.key, message));
      });
    });

    describe('getLog', () => {
      it('should send MESH_LOG message', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.getLog.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.MESH_LOG.key, message));
      });
    });

    describe('leave', () => {
      it('should send MESH_LEAVE message', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.leave.key, message);

        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.MESH_LEAVE.key, message));
      });

      it('should delete room from peer.rooms', () => {
        meshRoom.emit(MeshRoom.MESSAGE_EVENTS.leave.key, message);

        assert.equal(peer.rooms[roomName], undefined);
      });
    });
  });

  describe('_setupConnectionMessageHandlers', () => {
    const message = {};
    let peer;
    let connectionStub;

    beforeEach(() => {
      connectionStub = new EventEmitter();

      sinon.spy(connectionStub, 'on');
      sinon.spy(connectionStub, 'emit');

      peer = new Peer({
        key: apiKey
      });

      peer._setupConnectionMessageHandlers(connectionStub);
    });

    it('should set up handlers for Connection Message events', () => {
      assert(connectionStub.on.calledWith(MediaConnection.EVENTS.offer.key, sinon.match.func));
      assert(connectionStub.on.calledWith(MediaConnection.EVENTS.answer.key, sinon.match.func));
      assert(connectionStub.on.calledWith(MediaConnection.EVENTS.candidate.key, sinon.match.func));
    });

    describe('offer', () => {
      it('should send OFFER message', () => {
        connectionStub.emit(MediaConnection.EVENTS.offer.key, message);
        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.OFFER.key, message));
      });
    });

    describe('answer', () => {
      it('should send ANSWER message', () => {
        connectionStub.emit(MediaConnection.EVENTS.answer.key, message);
        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.ANSWER.key, message));
      });
    });

    describe('candidate', () => {
      it('should send CANDIDATE message', () => {
        connectionStub.emit(MediaConnection.EVENTS.candidate.key, message);
        assert(peer.socket.send.calledWith(util.MESSAGE_TYPES.CANDIDATE.key, message));
      });
    });
  });

  describe('_storeMessage', () => {
    const connectionId = 'testConnectionId';
    const message = {connectionId: connectionId};
    const type = 'testType';

    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    it('should create an array in _queuedMessages for the connection if it doesn\'t exist', () => {
      assert.equal(peer._queuedMessages[connectionId], undefined);

      peer._storeMessage(type, message);

      assert.equal(peer._queuedMessages[connectionId].constructor.name, 'Array');
      assert.equal(peer._queuedMessages[connectionId].length, 1);
      assert.deepEqual(peer._queuedMessages[connectionId][0], {type: type, payload: message});
    });

    it('should append an entry to _queuedMessages if the array exists', () => {
      peer._queuedMessages[connectionId] = [{}];

      peer._storeMessage(type, message);

      assert.equal(peer._queuedMessages[connectionId].constructor.name, 'Array');
      assert.equal(peer._queuedMessages[connectionId].length, 2);
      assert.deepEqual(peer._queuedMessages[connectionId][1], {type: type, payload: message});
    });
  });

  describe('reconnect', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    describe('disconnect was called but destroy wasn\'t', () => {
      beforeEach(() => {
        peer._disconnectCalled = true;
      });

      it('should call socket.reconnect', () => {
        peer.reconnect();

        assert.equal(peer.socket.reconnect.callCount, 1);
      });

      it('should set _disconnectCalled to false', () => {
        peer.reconnect();

        assert.equal(peer._disconnectCalled, false);
      });
    });

    describe('disconnect was not called', () => {
      it('should do nothing', () => {
        assert.equal(peer.socket.reconnect.callCount, 0);
      });
    });

    describe('destroy was called', () => {
      beforeEach(() => {
        peer._destroyCalled = true;
      });

      it('should do nothing', () => {
        assert.equal(peer.socket.reconnect.callCount, 0);
      });
    });
  });

  describe('_abort', () => {
    let type = 'testType';
    let message = 'testMessage';

    let peer;
    let errorSpy;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });

      // prevent error from breaking tests
      peer.on(Peer.EVENTS.error.key, () => {});

      errorSpy = sinon.spy(util, 'error');
    });

    afterEach(() => {
      errorSpy.restore();
    });

    it('should call disconnect', () => {
      const disconnectStub = sinon.stub(peer, 'disconnect');

      peer._abort(type, message);

      assert.equal(disconnectStub.callCount, 1);
    });

    it('should call util.error', () => {
      peer._abort(type, message);

      assert(errorSpy.calledWith('Aborting!'));
    });

    it('should cause peer to emit an error', done => {
      peer.on(Peer.EVENTS.error.key, err => {
        assert.equal(err.type, type);
        assert.equal(err.message, message);
        done();
      });

      peer._abort(type, message);
    });
  });

  describe('_cleanup', () => {
    let peer;
    beforeEach(() => {
      peer = new Peer({
        key: apiKey
      });
    });

    it('should call cleanupPeer for all connections', () => {
      const cleanupPeerStub = sinon.stub(peer, '_cleanupPeer');
      const peers = ['peer1', 'peer2', 'peer3'];

      for (let peerId of peers) {
        peer.connections[peerId] = {};
      }

      peer._cleanup();

      assert.equal(cleanupPeerStub.callCount, peers.length);
      for (let peerId of peers) {
        assert(cleanupPeerStub.calledWith(peerId));
      }
    });

    it('should emit a close event', done => {
      peer.on(Peer.EVENTS.close.key, () => {
        done();
      });

      peer._cleanup();
    });
  });

  describe('_addConnection', () => {
    describe('_storeMessage', () => {
      const connection = {};

      let peer;
      let setupConnectionMessageHandlerStub;
      beforeEach(() => {
        peer = new Peer({
          key: apiKey
        });

        setupConnectionMessageHandlerStub = sinon.stub(peer, '_setupConnectionMessageHandlers');
      });

      it('should create an array in connections for the peerId if it doesn\'t exist', () => {
        assert.equal(peer.connections[peerId], undefined);

        peer._addConnection(peerId, connection);

        assert.equal(peer.connections[peerId].constructor.name, 'Array');
        assert.equal(peer.connections[peerId].length, 1);
        assert.equal(peer.connections[peerId][0], connection);
      });

      it('should append an entry to connections if the array exists', () => {
        peer.connections[peerId] = [{}];

        peer._addConnection(peerId, connection);

        assert.equal(peer.connections[peerId].constructor.name, 'Array');
        assert.equal(peer.connections[peerId].length, 2);
        assert.equal(peer.connections[peerId][1], connection);
      });

      it('should call _setupConnectionHandlers on the added connection', () => {
        peer._addConnection(peerId, connection);

        assert.equal(setupConnectionMessageHandlerStub.callCount, 1);
        assert(setupConnectionMessageHandlerStub.calledWith(connection));
      });
    });
  });
});
