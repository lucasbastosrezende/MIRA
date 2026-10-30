'use client';

import { useEffect, useRef } from 'react';
import { mountMira } from './mira-ui.js';

// A interface do MIRA é montada dentro deste elemento e conversa com /api.
export default function MiraClient() {
  const ref = useRef(null);
  useEffect(() => mountMira(ref.current), []);
  return <div id="app" ref={ref} />;
}
