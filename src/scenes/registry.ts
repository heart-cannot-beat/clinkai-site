// 场景模块的清单：src/ 下所有 <场景名>.scene.ts，按文件名登记，用到时才加载。
// 新加一屏的动效只要放一个文件，不用改这里，几屏同时做也不会互相撞。
import type { SceneBuild } from './define';

export interface SceneModule {
  default: SceneBuild;
}

export type SceneLoader = () => Promise<SceneModule>;

const modules = import.meta.glob<SceneModule>('../**/*.scene.ts');

/** 「../home/01-hero.scene.ts」→「01-hero」 */
export function sceneNameFromPath(path: string): string {
  return path
    .split('/')
    .pop()!
    .replace(/\.scene\.ts$/, '');
}

export function collectScenes(
  found: Record<string, SceneLoader>,
): Map<string, SceneLoader> {
  const loaders = new Map<string, SceneLoader>();
  const paths = new Map<string, string>();
  for (const [path, load] of Object.entries(found)) {
    const name = sceneNameFromPath(path);
    const taken = paths.get(name);
    if (taken) {
      throw new Error(`有两个场景都叫「${name}」：${taken} 和 ${path}`);
    }
    paths.set(name, path);
    loaders.set(name, load);
  }
  return loaders;
}

export const sceneLoaders: ReadonlyMap<string, SceneLoader> =
  collectScenes(modules);
