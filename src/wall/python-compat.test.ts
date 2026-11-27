import { describe, expect, it } from 'vitest';
import { PythonRandom, pythonRound } from './python-compat';

// 下面的期望值都是用 CPython 3.14 的 random.Random 跑出来的，例如：
//   r = random.Random(170); [r.getrandbits(32) for _ in range(5)]
// 版本墙的格子划分依赖这个序列，所以这里钉死。

function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

describe('PythonRandom：和 CPython 的 random.Random 同一个序列', () => {
  it('种子 170 的前 5 个 32 位数和 Python 一致', () => {
    const random = new PythonRandom(170);

    expect(range(5).map(() => random.getRandBits(32))).toEqual([
      3381863077, 1481712417, 3908020535, 3509633198, 2519327664,
    ]);
  });

  it('getRandBits 取的是高位', () => {
    const random = new PythonRandom(170);

    expect(range(8).map(() => random.getRandBits(5))).toEqual([
      25, 11, 29, 26, 18, 10, 10, 2,
    ]);
  });

  it('用完 624 个状态后重新生成，序列仍然一致', () => {
    const random = new PythonRandom(170);
    for (let index = 0; index < 700; index += 1) random.getRandBits(32);

    expect(range(3).map(() => random.getRandBits(32))).toEqual([
      1833141477, 3809589428, 3605003063,
    ]);
  });

  it('种子 0 和 32 位最大值也一致', () => {
    const zero = new PythonRandom(0);
    expect(range(3).map(() => zero.getRandBits(32))).toEqual([
      3626764237, 1654615998, 3255389356,
    ]);

    const max = new PythonRandom(4294967295);
    const items = range(10);
    max.shuffle(items);
    expect(items).toEqual([0, 7, 1, 5, 2, 6, 4, 8, 3, 9]);
  });

  it('shuffle 原地打乱，连续两次的结果都和 Python 一致', () => {
    const random = new PythonRandom(170);
    const first = range(19);
    const second = range(7);

    random.shuffle(first);
    random.shuffle(second);

    expect(first).toEqual([
      13, 16, 8, 18, 7, 15, 12, 6, 0, 14, 1, 9, 4, 5, 3, 2, 17, 10, 11,
    ]);
    expect(second).toEqual([6, 2, 3, 5, 0, 1, 4]);
  });

  it('只接受 0 到 2^32-1 的整数种子', () => {
    expect(() => new PythonRandom(-1)).toThrow(RangeError);
    expect(() => new PythonRandom(1.5)).toThrow(RangeError);
    expect(() => new PythonRandom(2 ** 32)).toThrow(RangeError);
  });
});

describe('pythonRound：和 Python 的 round() 一样，正好一半时取偶数', () => {
  it('不是正好一半时四舍五入', () => {
    expect([2.4999, 2.6, 107.7, -1.2].map(pythonRound)).toEqual([
      2, 3, 108, -1,
    ]);
  });

  it('正好一半时取最近的偶数，而不是一律进位', () => {
    // Python：[round(v) for v in (0.5, 1.5, 2.5, -0.5)] == [0, 2, 2, 0]
    expect(
      [0.5, 1.5, 2.5, -0.5].map((value) => pythonRound(value) + 0),
    ).toEqual([0, 2, 2, 0]);
  });
});
