// 设计侧的版本墙脚本（design/wall/generate_wall.py）是 Python 写的。
// 这里是移植时必须和 Python 行为一致的两处：随机数序列和取整。

// 和 CPython 的 random.Random(整数种子) 产出同一个序列的随机数（MT19937）。
// 脚本用它来切格子；原样复现，同样的种子才能得到同样的 40 张。
// 只移植了版本墙用到的两个方法。

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export class PythonRandom {
  private readonly state = new Uint32Array(N);
  private index = N;

  /** 种子是 0 到 2^32-1 的整数，对应 Python 里的 random.Random(seed)。 */
  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError(`种子必须是 0 到 2^32-1 的整数，收到 ${seed}`);
    }
    this.seedByArray([seed]);
  }

  /** 对应 getrandbits(k)，k 在 1 到 32 之间；取的是 32 位输出的高 k 位。 */
  getRandBits(bits: number): number {
    if (!Number.isInteger(bits) || bits < 1 || bits > 32) {
      throw new RangeError(`位数必须是 1 到 32 的整数，收到 ${bits}`);
    }
    return this.nextUint32() >>> (32 - bits);
  }

  /** 对应 random.shuffle(x)：从后往前，每个位置和前面随机一个位置交换。 */
  shuffle<T>(items: T[]): void {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = this.randBelow(index + 1);
      const moved = items[index];
      items[index] = items[other];
      items[other] = moved;
    }
  }

  // 对应 _randbelow_with_getrandbits：取够位数，超出范围就重取
  private randBelow(limit: number): number {
    const bits = 32 - Math.clz32(limit);
    let value = this.getRandBits(bits);
    while (value >= limit) value = this.getRandBits(bits);
    return value;
  }

  private seedByInteger(seed: number): void {
    const state = this.state;
    state[0] = seed;
    for (let index = 1; index < N; index += 1) {
      const previous = state[index - 1] ^ (state[index - 1] >>> 30);
      state[index] = Math.imul(1812433253, previous) + index;
    }
  }

  // 对应 init_by_array：Python 把整数种子拆成 32 位一段的数组再搅进状态
  private seedByArray(key: number[]): void {
    const state = this.state;
    this.seedByInteger(19650218);

    let index = 1;
    let keyIndex = 0;
    for (let round = Math.max(N, key.length); round > 0; round -= 1) {
      const previous = state[index - 1] ^ (state[index - 1] >>> 30);
      state[index] =
        (state[index] ^ Math.imul(previous, 1664525)) +
        key[keyIndex] +
        keyIndex;
      index += 1;
      keyIndex += 1;
      if (index >= N) {
        state[0] = state[N - 1];
        index = 1;
      }
      if (keyIndex >= key.length) keyIndex = 0;
    }
    for (let round = N - 1; round > 0; round -= 1) {
      const previous = state[index - 1] ^ (state[index - 1] >>> 30);
      state[index] = (state[index] ^ Math.imul(previous, 1566083941)) - index;
      index += 1;
      if (index >= N) {
        state[0] = state[N - 1];
        index = 1;
      }
    }
    state[0] = UPPER_MASK;
    this.index = N;
  }

  private twist(): void {
    const state = this.state;
    for (let index = 0; index < N; index += 1) {
      const mixed =
        (state[index] & UPPER_MASK) | (state[(index + 1) % N] & LOWER_MASK);
      state[index] =
        state[(index + M) % N] ^ (mixed >>> 1) ^ (mixed & 1 ? MATRIX_A : 0);
    }
    this.index = 0;
  }

  private nextUint32(): number {
    if (this.index >= N) this.twist();
    let value = this.state[this.index];
    this.index += 1;
    value ^= value >>> 11;
    value ^= (value << 7) & 0x9d2c5680;
    value ^= (value << 15) & 0xefc60000;
    value ^= value >>> 18;
    return value >>> 0;
  }
}

/**
 * 对应 Python 的 round(x)：正好一半时取最近的偶数（JS 的 Math.round 是一律进位）。
 * 脚本用它算图片的等比高度，取整方式不一样，像素就会差 1。
 */
export function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest < 0.5) return floor;
  if (rest > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}
