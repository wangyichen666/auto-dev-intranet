import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Status } from '../typings/api';
export const isActive = (status: Status) => ['QUEUED', 'RUNNING', 'WAITING'].includes(status);
export function useVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  const client = useQueryClient();
  useEffect(() => {
    const onVisibility = () => { setVisible(!document.hidden); if (!document.hidden) void client.invalidateQueries(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [client]);
  return visible;
}
