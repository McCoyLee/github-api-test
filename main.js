/**
 * 斗地主 · 主入口
 * 管理 UI、游戏状态、联机通信
 */

const net = new GameNetwork();
let gameState = {
  phase: 'lobby',       // lobby | playing | ended
  players: [],          // [self, top, right] 或 [self, right]
  hand: [],
  dizhuCards: [],
  dizhuPlayer: -1,      // 0=self, 1=top, 2=right
  currentPlayer: 0,
  lastPlay: null,
  lastPlayer: -1,
  passCount: 0,
  myIndex: 0,
  playerCount: 0,
  selectedCards: [],
};

/* ---- DOM 引用 ---- */
const $ = id => document.getElementById(id);
const lobby = $('lobby');
const game = $('game');
const roomDisplay = $('room-display');
const connStatus = $('connection-status');
const myHand = $('my-hand');
const bottomPlayed = $('bottom-played');
const topPlayed = $('top-played');
const rightPlayed = $('right-played');
const topName = $('top-name');
const topCount = $('top-count');
const rightName = $('right-name');
const rightCount = $('right-count');
const bottomCount = $('bottom-count');
const dizhuCards = $('dizhu-cards');
const msgArea = $('message-area');

const btnCreate = $('btn-create');
const btnJoin = $('btn-join');
const btnLeave = $('btn-leave');
const btnCall = $('btn-call');
const btnNotCall = $('btn-not-call');
const btnPlay = $('btn-play');
const btnPass = $('btn-pass');
const btnHint = $('btn-hint');
const inputJoin = $('input-join');

/* ---- 事件绑定 ---- */
btnCreate.addEventListener('click', createRoom);
btnJoin.addEventListener('click', joinRoom);
btnLeave.addEventListener('click', leaveRoom);
btnCall.addEventListener('click', () => handleCall(true));
btnNotCall.addEventListener('click', () => handleCall(false));
btnPlay.addEventListener('click', playCards);
btnPass.addEventListener('click', passTurn);
btnHint.addEventListener('click', showHint);

/* ---- 创建房间 ---- */
async function createRoom() {
  connStatus.textContent = '⏳ 创建房间中…';
  btnCreate.disabled = true;
  try {
    const roomId = await net.createRoom();
    roomDisplay.textContent = `房间号: ${roomId}`;
    connStatus.textContent = '✅ 房间已创建，等待对手加入…';
    gameState.myIndex = 0;
    gameState.playerCount = 1;
    net.onPeerConnected = () => {
      connStatus.textContent = '✅ 对手已加入！';
      gameState.playerCount = 2;
      setTimeout(startGame, 500);
    };
    net.onMessage = handleMessage;
    net.onPeerDisconnected = () => {
      setMessage('❌ 对手已断开');
      setTimeout(leaveRoom, 2000);
    };
    lobby.style.display = 'none';
    game.style.display = 'flex';
  } catch (err) {
    connStatus.textContent = '❌ 创建失败: ' + err.message;
    btnCreate.disabled = false;
  }
}

/* ---- 加入房间 ---- */
async function joinRoom() {
  const roomId = inputJoin.value.trim();
  if (!roomId) { connStatus.textContent = '⚠️ 请输入房间号'; return; }
  connStatus.textContent = '⏳ 加入中…';
  btnJoin.disabled = true;
  try {
    await net.joinRoom(roomId);
    roomDisplay.textContent = `房间号: ${roomId}`;
    gameState.myIndex = 1;
    gameState.playerCount = 2;
    net.onPeerConnected = () => {
      connStatus.textContent = '✅ 已加入房间！';
      gameState.playerCount = 2;
      setTimeout(startGame, 500);
    };
    net.onMessage = handleMessage;
    net.onPeerDisconnected = () => {
      setMessage('❌ 房主已断开');
      setTimeout(leaveRoom, 2000);
    };
    lobby.style.display = 'none';
    game.style.display = 'flex';
  } catch (err) {
    connStatus.textContent = '❌ 加入失败: ' + err.message;
    btnJoin.disabled = false;
  }
}

/* ---- 离开 ---- */
function leaveRoom() {
  net.disconnect();
  gameState.phase = 'lobby';
  lobby.style.display = 'flex';
  game.style.display = 'none';
  connStatus.textContent = '已断开连接';
  btnCreate.disabled = false;
  btnJoin.disabled = false;
  hideAllActions();
}

/* ---- 开始游戏 ---- */
function startGame() {
  setMessage('🃏 发牌中…');
  const deck = shuffle(createDeck());
  const cardsPerPlayer = 17;
  const p0 = deck.slice(0, cardsPerPlayer);
  const p1 = deck.slice(cardsPerPlayer, cardsPerPlayer * 2);
  const dizhu = deck.slice(cardsPerPlayer * 2);

  if (gameState.myIndex === 0) {
    gameState.hand = p0;
    gameState.players = [p0, p1];
  } else {
    gameState.hand = p1;
    gameState.players = [p1, p0];
  }
  gameState.dizhuCards = dizhu;
  gameState.phase = 'playing';

  // 通知对手手牌数量
  net.send({ type: 'hand_count', count: gameState.hand.length });

  // 显示自己的牌
  renderHand();
  updateCounts();

  // 随机选第一个叫地主的人
  gameState.currentPlayer = Math.floor(Math.random() * 2);
  setMessage(gameState.currentPlayer === 0 ? '🎯 你叫地主' : '⏳ 对手叫地主中…');

  if (gameState.currentPlayer === 0) {
    showCallButtons();
  } else {
    hideAllActions();
    // 对手AI自动叫地主
    setTimeout(() => {
      const call = Math.random() > 0.5;
      net.send({ type: 'call', call, player: 1 });
      handleCallResult(1, call);
    }, 1000);
  }
}

/* ---- 叫地主处理 ---- */
function handleCall(call) {
  hideAllActions();
  net.send({ type: 'call', call, player: 0 });
  handleCallResult(0, call);
}

function handleCallResult(player, call) {
  if (call) {
    setMessage(player === 0 ? '🎉 你叫地主！' : '🎉 对手叫地主！');
    gameState.dizhuPlayer = player;
    // 给地主补底牌
    if (player === gameState.myIndex) {
      gameState.hand.push(...gameState.dizhuCards);
      gameState.hand = sortCards(gameState.hand);
      renderHand();
    }
    updateCounts();
    renderDizhuCards();
    // 地主先出
    gameState.currentPlayer = player;
    gameState.lastPlay = null;
    gameState.lastPlayer = -1;
    gameState.passCount = 0;
    setMessage(player === 0 ? '🎯 轮到你出牌' : '⏳ 对手出牌中…');
    if (gameState.currentPlayer === 0) {
      showPlayButtons();
    } else {
      hideAllActions();
      setTimeout(aiPlay, 800);
    }
  } else {
    setMessage(player === 0 ? '🙅 你不叫' : '🙅 对手不叫');
    // 换另一个玩家叫
    const next = player === 0 ? 1 : 0;
    gameState.currentPlayer = next;
    if (next === 0) {
      setMessage('🎯 轮到你叫地主');
      showCallButtons();
    } else {
      setMessage('⏳ 对手叫地主中…');
      hideAllActions();
      setTimeout(() => {
        const call2 = Math.random() > 0.3;
        net.send({ type: 'call', call: call2, player: 1 });
        handleCallResult(1, call2);
      }, 1000);
    }
  }
}

/* ---- 出牌 ---- */
function playCards() {
  const selected = gameState.selectedCards;
  if (selected.length === 0) return;

  const handType = getHandType(selected);
  if (!handType) {
    setMessage('❌ 无效牌型');
    return;
  }

  if (gameState.lastPlay && gameState.lastPlayer !== gameState.myIndex) {
    if (!canBeat(handType, gameState.lastPlay)) {
      setMessage('❌ 管不上');
      return;
    }
  }

  // 出牌
  const played = [...selected];
  gameState.hand = gameState.hand.filter(c => !selected.includes(c));
  gameState.selectedCards = [];
  gameState.lastPlay = handType;
  gameState.lastPlayer = gameState.myIndex;
  gameState.passCount = 0;

  renderHand();
  showPlayedCards(bottomPlayed, played);
  updateCounts();
  hideAllActions();

  net.send({ type: 'play', cards: played, handType });

  if (gameState.hand.length === 0) {
    // 赢了！
    setMessage('🎉🎉🎉 你赢了！');
    net.send({ type: 'win', player: gameState.myIndex });
    gameState.phase = 'ended';
    return;
  }

  // 下一个玩家
  gameState.currentPlayer = gameState.myIndex === 0 ? 1 : 0;
  setMessage('⏳ 对手出牌中…');
  setTimeout(aiPlay, 600);
}

function passTurn() {
  hideAllActions();
  net.send({ type: 'pass', player: gameState.myIndex });
  gameState.passCount++;
  setMessage('🙅 不要');

  if (gameState.passCount >= 2) {
    // 两家都不要，上一个出牌的人继续出
    gameState.lastPlay = null;
    gameState.lastPlayer = -1;
    gameState.passCount = 0;
  }

  gameState.currentPlayer = gameState.myIndex === 0 ? 1 : 0;
  setTimeout(aiPlay, 600);
}

/* ---- AI 出牌（对手） ---- */
function aiPlay() {
  if (gameState.phase === 'ended') return;
  if (gameState.currentPlayer !== 1) return;

  const opponentHand = gameState.players[1];
  let lastPlay = gameState.lastPlay;
  if (gameState.lastPlayer === 1) lastPlay = null;

  const play = aiFindPlay(opponentHand, lastPlay);

  if (play) {
    // 出牌
    play.forEach(c => {
      const idx = opponentHand.indexOf(c);
      if (idx > -1) opponentHand.splice(idx, 1);
    });
    const handType = getHandType(play);
    gameState.lastPlay = handType;
    gameState.lastPlayer = 1;
    gameState.passCount = 0;

    showPlayedCards(topPlayed, play);
    updateCounts();
    setMessage(`🤖 对手出了 ${handTypeLabel(handType)}`);

    net.send({ type: 'opponent_play', cards: play, handType });

    if (opponentHand.length === 0) {
      setMessage('😢 对手赢了！');
      net.send({ type: 'win', player: 1 });
      gameState.phase = 'ended';
      return;
    }

    gameState.currentPlayer = 0;
    setMessage('🎯 轮到你出牌');
    showPlayButtons();
  } else {
    // 不要
    gameState.passCount++;
    setMessage('🤖 对手不要');
    net.send({ type: 'opponent_pass' });

    if (gameState.passCount >= 2) {
      gameState.lastPlay = null;
      gameState.lastPlayer = -1;
      gameState.passCount = 0;
    }

    gameState.currentPlayer = 0;
    setMessage('🎯 轮到你出牌');
    showPlayButtons();
  }
}

/* ---- 网络消息处理 ---- */
function handleMessage(data) {
  switch (data.type) {
    case 'hand_count':
      // 对手手牌数量更新
      break;
    case 'call':
      handleCallResult(data.player, data.call);
      break;
    case 'play':
      // 对手出的牌（从房主视角）
      break;
    case 'opponent_play':
      // 对手出的牌（从加入者视角）
      break;
    case 'opponent_pass':
      break;
    case 'win':
      if (data.player !== gameState.myIndex) {
        setMessage('😢 对手赢了！');
        gameState.phase = 'ended';
      }
      break;
  }
}

/* ---- 渲染 ---- */
function renderHand() {
  myHand.innerHTML = '';
  const sorted = sortCards(gameState.hand);
  sorted.forEach(c => {
    const el = document.createElement('span');
    el.className = `card ${c.rank >= 16 ? '' : (c.suit === 1 || c.suit === 2 ? 'red' : 'black')}`;
    el.textContent = cardDisplay(c);
    el.dataset.key = cardId(c);
    el.addEventListener('click', () => toggleCard(c, el));
    myHand.appendChild(el);
  });
  bottomCount.textContent = `${gameState.hand.length} 张`;
}

function toggleCard(card, el) {
  if (gameState.currentPlayer !== gameState.myIndex) return;
  const key = cardId(card);
  const idx = gameState.selectedCards.findIndex(c => cardId(c) === key);
  if (idx > -1) {
    gameState.selectedCards.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    gameState.selectedCards.push(card);
    el.classList.add('selected');
  }
}

function showPlayedCards(container, cards) {
  container.innerHTML = '';
  cards.forEach(c => {
    const el = document.createElement('span');
    el.className = `card small ${c.rank >= 16 ? '' : (c.suit === 1 || c.suit === 2 ? 'red' : 'black')}`;
    el.textContent = cardDisplay(c);
    container.appendChild(el);
  });
}

function renderDizhuCards() {
  dizhuCards.innerHTML = '';
  gameState.dizhuCards.forEach(c => {
    const el = document.createElement('span');
    el.className = `card small ${c.rank >= 16 ? '' : (c.suit === 1 || c.suit === 2 ? 'red' : 'black')}`;
    el.textContent = cardDisplay(c);
    dizhuCards.appendChild(el);
  });
}

function updateCounts() {
  const oppHand = gameState.players[1];
  if (oppHand) {
    topName.textContent = '对手';
    topCount.textContent = `${oppHand.length} 张`;
  }
  bottomCount.textContent = `${gameState.hand.length} 张`;
}

function setMessage(msg) {
  msgArea.textContent = msg;
}

function handTypeLabel(ht) {
  const labels = {
    1: '单张', 2: '对子', 3: '三条', 4: '三带一', 5: '三带二',
    6: '顺子', 7: '连对', 8: '飞机', 9: '飞机带翼',
    10: '四带二', 11: '💣 炸弹', 12: '🚀 火箭'
  };
  return labels[ht.type] || '牌型';
}

/* ---- 按钮控制 ---- */
function hideAllActions() {
  [btnCall, btnNotCall, btnPlay, btnPass, btnHint].forEach(b => b.style.display = 'none');
}

function showCallButtons() {
  btnCall.style.display = 'inline-block';
  btnNotCall.style.display = 'inline-block';
  btnPlay.style.display = 'none';
  btnPass.style.display = 'none';
  btnHint.style.display = 'none';
}

function showPlayButtons() {
  btnCall.style.display = 'none';
  btnNotCall.style.display = 'none';
  btnPlay.style.display = 'inline-block';
  btnPass.style.display = 'inline-block';
  btnHint.style.display = 'inline-block';
}

/* ---- 提示 ---- */
function showHint() {
  const lastPlay = gameState.lastPlay && gameState.lastPlayer !== gameState.myIndex ? gameState.lastPlay : null;
  const hints = getHints(gameState.hand, lastPlay);
  if (hints.length === 0) {
    setMessage('💡 没有能出的牌');
    return;
  }
  // 选第一个提示
  const hint = hints[0];
  gameState.selectedCards = [];
  document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
  hint.forEach(c => {
    const key = cardId(c);
    const el = myHand.querySelector(`[data-key="${key}"]`);
    if (el) {
      el.classList.add('selected');
      gameState.selectedCards.push(c);
    }
  });
  setMessage(`💡 提示: ${handTypeLabel(getHandType(hint))}`);
}
