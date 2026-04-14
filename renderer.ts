import ReactReconciler from 'react-reconciler';
import { DefaultEventPriority } from 'react-reconciler/constants.js';
import React from 'react';
import hostConfig from './hostConfig.js';
import type { Container } from './types.js';

const patchedConfig = {
  ...hostConfig,
  getCurrentEventPriority: () => DefaultEventPriority,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reconciler = ReactReconciler(patchedConfig as any);

const rootContainer: Container = { id: 'root', type: 'root', children: [] };

const fiberRoot = reconciler.createContainer(
  rootContainer,
  0,     // ConcurrentMode = 1, LegacyMode = 0
  null,
  false,
  null,
  '',
  console.error,
  null,
);

export function render(element: React.ReactElement): void {
  reconciler.updateContainer(element, fiberRoot, null, null);
}

export function unmount(): void {
  reconciler.updateContainer(null, fiberRoot, null, null);
}
