/**
 * 斗地主核心逻辑
 * 牌面：3-2 分别对应 3-15, 小王=16, 大王=17
 * 花色：♠♥♣♦ (0-3)
 */

const SUITS = ['♠', '♥', '♣', '♦'];
const RANK_NAMES = {
  3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',
  11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'
};

function createDeck() {
  const cards = [];
  for (let r = 3; r <= 15; r++) {
    for (let s = 0; s < 4; s++) {
      cards.push({ rank: r, suit: s });
    }
  }
  cards.push({ rank: 16, suit: -1 }); // 小王
  cards.push({ rank: 17, suit: -1 }); // 大王
  return cards;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardId(c) { return `${c.rank}_${c.suit}`; }

function cardDisplay(c) {
  if (c.rank === 16) return '🃏';
  if (c.rank === 17) return '🃏';
  const color = (c.suit === 1 || c.suit === 2) ? 'red' : 'black';
  return `${SUITS[c.suit]}${RANK_NAMES[c.rank]}`;
}

function sortCards(cards) {
  return [...cards].sort((a, b) => b.rank - a.rank || a.suit - b.suit);
}

/* ---- 牌型判断 ---- */
const HAND_TYPES = {
  SINGLE: 1, PAIR: 2, THREE: 3, THREE_ONE: 4, THREE_TWO: 5,
  STRAIGHT: 6, PAIR_STRAIGHT: 7, PLANE: 8, PLANE_WING: 9,
  FOUR_TWO: 10, BOMB: 11, ROCKET: 12
};

function getHandType(cards) {
  const n = cards.length;
  if (n === 0) return null;
  const ranks = cards.map(c => c.rank).sort((a,b) => a-b);
  const counts = {};
  ranks.forEach(r => { counts[r] = (counts[r]||0) + 1; });
  const vals = Object.values(counts).sort((a,b) => b-a);
  const keys = Object.keys(counts).map(Number).sort((a,b) => a-b);

  // 火箭
  if (n === 2 && ranks[0] === 16 && ranks[1] === 17) return { type: HAND_TYPES.ROCKET, rank: 17, len: 2 };

  // 炸弹
  if (n === 4 && vals[0] === 4) return { type: HAND_TYPES.BOMB, rank: keys[0], len: 4 };

  // 单张
  if (n === 1) return { type: HAND_TYPES.SINGLE, rank: ranks[0], len: 1 };

  // 对子
  if (n === 2 && vals[0] === 2 && ranks[0] !== 16) return { type: HAND_TYPES.PAIR, rank: keys[0], len: 2 };

  // 三张
  if (n === 3 && vals[0] === 3) return { type: HAND_TYPES.THREE, rank: keys[0], len: 3 };

  // 三带一
  if (n === 4 && vals[0] === 3 && vals[1] === 1) return { type: HAND_TYPES.THREE_ONE, rank: keys.find(k => counts[k]===3), len: 4 };

  // 三带二
  if (n === 5 && vals[0] === 3 && vals[1] === 2) return { type: HAND_TYPES.THREE_TWO, rank: keys.find(k => counts[k]===3), len: 5 };

  // 顺子 (5-12张, 3-A, 不含2和王)
  if (n >= 5 && vals.every(v => v === 1) && keys[keys.length-1] <= 14 && keys[keys.length-1] - keys[0] === n - 1) {
    return { type: HAND_TYPES.STRAIGHT, rank: keys[keys.length-1], len: n };
  }

  // 连对 (3对起, 3-A)
  if (n >= 6 && n % 2 === 0 && vals.every(v => v === 2) && keys[keys.length-1] <= 14 && keys[keys.length-1] - keys[0] === keys.length - 1) {
    return { type: HAND_TYPES.PAIR_STRAIGHT, rank: keys[keys.length-1], len: n };
  }

  // 飞机 (2个起, 3-A)
  const threeRanks = keys.filter(k => counts[k] === 3);
  if (threeRanks.length >= 2) {
    // 检查是否连续
    const sorted = threeRanks.sort((a,b) => a-b);
    if (sorted[sorted.length-1] <= 14 && sorted[sorted.length-1] - sorted[0] === sorted.length - 1) {
      const wingCount = n - sorted.length * 3;
      // 飞机不带
      if (wingCount === 0) return { type: HAND_TYPES.PLANE, rank: sorted[sorted.length-1], len: n };
      // 飞机带单
      if (wingCount === sorted.length) return { type: HAND_TYPES.PLANE_WING, rank: sorted[sorted.length-1], len: n, subType: 'single' };
      // 飞机带对
      if (wingCount === sorted.length * 2) return { type: HAND_TYPES.PLANE_WING, rank: sorted[sorted.length-1], len: n, subType: 'pair' };
    }
  }

  // 四带二
  const fourRank = keys.find(k => counts[k] === 4);
  if (fourRank && n === 6) return { type: HAND_TYPES.FOUR_TWO, rank: fourRank, len: 6 };

  return null;
}

function canBeat(current, previous) {
  if (!previous) return true;
  if (!current) return false;
  // 火箭最大
  if (current.type === HAND_TYPES.ROCKET) return true;
  if (previous.type === HAND_TYPES.ROCKET) return false;
  // 炸弹
  if (current.type === HAND_TYPES.BOMB && previous.type === HAND_TYPES.BOMB) return current.rank > previous.rank;
  if (current.type === HAND_TYPES.BOMB) return true;
  if (previous.type === HAND_TYPES.BOMB) return false;
  // 同类型比较
  if (current.type !== previous.type) return false;
  if (current.len !== previous.len) return false;
  return current.rank > previous.rank;
}

/* ---- AI 出牌（简单策略） ---- */
function aiFindPlay(hand, lastPlay) {
  if (!lastPlay) {
    // 先出最小的单张或对子
    const sorted = sortCards(hand);
    // 出最小的单张
    return [sorted[0]];
  }

  const { type, len, rank } = lastPlay;

  // 如果是自己出的，随便出
  if (!lastPlay) return [sortCards(hand)[0]];

  const ranks = hand.map(c => c.rank);
  const counts = {};
  ranks.forEach(r => { counts[r] = (counts[r]||0) + 1; });
  const keys = Object.keys(counts).map(Number).sort((a,b) => a-b);

  // 找能压的
  switch (type) {
    case HAND_TYPES.SINGLE: {
      for (const r of keys) {
        if (r > rank && counts[r] >= 1) {
          const idx = hand.findIndex(c => c.rank === r);
          return [hand[idx]];
        }
      }
      break;
    }
    case HAND_TYPES.PAIR: {
      for (const r of keys) {
        if (r > rank && counts[r] >= 2) {
          const idxs = hand.filter(c => c.rank === r).slice(0,2);
          return idxs;
        }
      }
      break;
    }
    case HAND_TYPES.THREE:
    case HAND_TYPES.THREE_ONE:
    case HAND_TYPES.THREE_TWO: {
      for (const r of keys) {
        if (r > rank && counts[r] >= 3) {
          const three = hand.filter(c => c.rank === r).slice(0,3);
          if (type === HAND_TYPES.THREE) return three;
          // 找带牌
          const rest = hand.filter(c => c.rank !== r);
          if (type === HAND_TYPES.THREE_ONE && rest.length >= 1) {
            return [...three, rest[0]];
          }
          if (type === HAND_TYPES.THREE_TWO) {
            const restCounts = {};
            rest.forEach(c => { restCounts[c.rank] = (restCounts[c.rank]||0)+1; });
            const pairRank = Object.keys(restCounts).find(k => restCounts[k] >= 2);
            if (pairRank) {
              const pair = rest.filter(c => c.rank === Number(pairRank)).slice(0,2);
              return [...three, ...pair];
            }
          }
        }
      }
      break;
    }
    case HAND_TYPES.STRAIGHT: {
      // 简单：找同长度的顺子
      for (let start = 3; start + len - 1 <= 14; start++) {
        if (start + len - 1 <= rank) continue;
        let ok = true;
        const picked = [];
        for (let r = start; r < start + len; r++) {
          const idx = hand.findIndex(c => c.rank === r && !picked.includes(c));
          if (idx === -1) { ok = false; break; }
          picked.push(hand[idx]);
        }
        if (ok) return picked;
      }
      break;
    }
    case HAND_TYPES.BOMB: {
      for (const r of keys) {
        if (r > rank && counts[r] >= 4) {
          return hand.filter(c => c.rank === r).slice(0,4);
        }
      }
      break;
    }
  }

  // 有炸弹就炸
  for (const r of keys) {
    if (counts[r] === 4) {
      return hand.filter(c => c.rank === r).slice(0,4);
    }
  }
  // 有火箭就出
  if (ranks.includes(16) && ranks.includes(17)) {
    return hand.filter(c => c.rank >= 16);
  }

  return null; // 要不起
}

/* ---- 提示功能 ---- */
function getHints(hand, lastPlay) {
  const hints = [];
  if (!lastPlay) {
    // 随便出最小的
    const sorted = sortCards(hand);
    hints.push([sorted[0]]);
    return hints;
  }

  const { type, len, rank } = lastPlay;
  const ranks = hand.map(c => c.rank);
  const counts = {};
  ranks.forEach(r => { counts[r] = (counts[r]||0) + 1; });
  const keys = Object.keys(counts).map(Number).sort((a,b) => a-b);

  switch (type) {
    case HAND_TYPES.SINGLE: {
      for (const r of keys) {
        if (r > rank && counts[r] >= 1) {
          hints.push([hand.find(c => c.rank === r)]);
        }
      }
      break;
    }
    case HAND_TYPES.PAIR: {
      for (const r of keys) {
        if (r > rank && counts[r] >= 2) {
          hints.push(hand.filter(c => c.rank === r).slice(0,2));
        }
      }
      break;
    }
    case HAND_TYPES.BOMB: {
      for (const r of keys) {
        if (r > rank && counts[r] >= 4) {
          hints.push(hand.filter(c => c.rank === r).slice(0,4));
        }
      }
      break;
    }
  }

  // 炸弹/火箭提示
  for (const r of keys) {
    if (counts[r] === 4 && (type !== HAND_TYPES.BOMB || r > rank)) {
      hints.push(hand.filter(c => c.rank === r).slice(0,4));
    }
  }
  if (ranks.includes(16) && ranks.includes(17)) {
    hints.push(hand.filter(c => c.rank >= 16));
  }

  return hints;
}
