import React from 'react';
import type { CollabUser } from '../../types/notes';

export interface CollabPresenceProps {
  users: CollabUser[];
  currentUserId: string;
}

export const CollabPresence: React.FC<CollabPresenceProps> = ({ users, currentUserId }) => {
  if (!users || users.length === 0) return null;

  return (
    <div className="flex items-center -space-x-1 overflow-hidden select-none">
      {users.map((u) => {
        const isMe = u.userId === currentUserId;
        const initial = (u.name?.[0] || 'U').toUpperCase();

        return (
          <div
            key={u.clientId}
            title={`${u.name} ${isMe ? '(Tú)' : ''}`}
            className="w-5 h-5 rounded-full bg-veyra-elevated border border-veyra-border flex items-center justify-center text-[10px] font-medium text-veyra-text shrink-0 cursor-default"
          >
            {initial}
          </div>
        );
      })}
    </div>
  );
};
