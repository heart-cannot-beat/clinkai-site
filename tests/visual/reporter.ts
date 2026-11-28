// 截图对比跑完后，把各屏的差异数字汇成一张表：打在终端里；在 GitHub Actions 里同时写进这次运行的摘要。
// 数字是每条测试自己算好、作为附件交上来的，这里只负责汇总。
import { appendFileSync } from 'node:fs';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** 测试交数字用的附件名 */
export const NUMBERS_ATTACHMENT = 'visual-numbers';

/** 一遍比对的结果 */
export interface PassNumbers {
  /** 差值超过容差的像素数 */
  differing: number;
  /** 占整屏的比例 */
  ratio: number;
  /** 最大的差值（0–255） */
  maxDelta: number;
}

/** 一屏的结果 */
export interface ScreenNumbers {
  screen: string;
  /** 藏起图片，只比版式、文字和色块 */
  layout: PassNumbers & { maxPixels: number };
  /** 带图片比整屏 */
  withImages: PassNumbers & { maxRatio: number };
}

/** 比例写成百分数，保留三位小数 */
export const percent = (ratio: number): string =>
  `${(ratio * 100).toFixed(3)}%`;

interface Row {
  title: string;
  passed: boolean;
  numbers: ScreenNumbers | null;
}

function line(row: Row): string {
  const result = row.passed ? '通过' : '**失败**';
  if (!row.numbers) return `| ${row.title} | — | — | — | — | ${result} |`;
  const { layout, withImages } = row.numbers;
  return [
    '',
    row.numbers.screen,
    `${layout.differing} 个（最大差值 ${layout.maxDelta}）`,
    `${layout.maxPixels} 个`,
    `${percent(withImages.ratio)}（${withImages.differing} 个）`,
    percent(withImages.maxRatio),
    result,
    '',
  ]
    .join(' | ')
    .trim();
}

export default class SummaryReporter implements Reporter {
  private rows: Row[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find(
      ({ name }) => name === NUMBERS_ATTACHMENT,
    );
    this.rows.push({
      title: test.title,
      passed: result.status === 'passed',
      numbers: attachment?.body
        ? (JSON.parse(attachment.body.toString('utf8')) as ScreenNumbers)
        : null,
    });
  }

  onEnd(): void {
    if (this.rows.length === 0) return;
    const table = [
      '| 屏 | 不带图片：差异像素 | 上限 | 带图片：差异像素占整屏 | 上限 | 结果 |',
      '| :-- | --: | --: | --: | --: | :-- |',
      ...this.rows.map(line),
    ].join('\n');

    console.log(`\n${table}\n`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) appendFileSync(summary, `## 截图对比\n\n${table}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
