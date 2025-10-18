import cx from '@src/cx.mjs';
import { useCollab } from '@src/repl/CollabContext';
import { getCollabLedColor, getDisplayStatus } from './collabStatus.mjs';
import { setActiveFooter, setIsPanelOpened } from '../../settings.mjs';

export function CollabButton({ activeFooter, isPanelOpen }) {
  const { status: collabStatus, peerCount: collabPeerCount } = useCollab();

  return (
    <button
      onClick={() => {
        if (activeFooter === 'collab' && isPanelOpen) {
          setIsPanelOpened(false);
        } else {
          setActiveFooter('collab');
          setIsPanelOpened(true);
        }
      }}
      title={getDisplayStatus(collabStatus, collabPeerCount)}
      className={cx(
        'p-2 hover:opacity-50 flex items-center space-x-2',
        activeFooter === 'collab' && isPanelOpen && 'opacity-100',
      )}
    >
      <div className={cx('w-2 h-2 rounded-full', getCollabLedColor(collabStatus, collabPeerCount))} />
      <span>collab</span>
    </button>
  );
}
