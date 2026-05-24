/**
 * 联机网络模块 — 基于 PeerJS (WebRTC)
 * 房主创建房间，其他人输入房间号加入
 */

class GameNetwork {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.roomId = null;
    this.isHost = false;
    this.onMessage = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
  }

  // 创建房间（房主）
  createRoom() {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.peer = new Peer(undefined, {
        debug: 0
      });

      this.peer.on('open', (id) => {
        this.roomId = id;
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this._setupConnection();
        if (this.onPeerConnected) this.onPeerConnected();
      });

      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  // 加入房间
  joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.peer = new Peer(undefined, {
        debug: 0
      });

      this.peer.on('open', () => {
        this.conn = this.peer.connect(roomId, {
          reliable: true
        });
        this.roomId = roomId;
        this._setupConnection();
        resolve();
      });

      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  _setupConnection() {
    this.conn.on('open', () => {
      if (this.onPeerConnected) this.onPeerConnected();
    });

    this.conn.on('data', (data) => {
      if (this.onMessage) this.onMessage(data);
    });

    this.conn.on('close', () => {
      if (this.onPeerDisconnected) this.onPeerDisconnected();
    });
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  disconnect() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.conn = null;
    this.peer = null;
  }
}
