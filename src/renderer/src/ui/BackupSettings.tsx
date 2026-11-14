import { useT } from '../../../board/i18n'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'
import { useApp } from '../appState'

export function BackupSettings() {
  const t = useT()
  const backupDir = useApp((s) => s.library.backupDir)
  if (!platform.capabilities.backup) return null
  return (
    <>
      <div className="popover-title section">{t('settings.backup')}</div>
      <div className="backup-row">
        <span className="backup-path" title={backupDir ?? undefined}>
          {backupDir ?? t('settings.backupOff')}
        </span>
        <button className="text-btn outline" onClick={() => void boardLibrary.chooseBackupDir()}>
          {t(backupDir ? 'settings.backupChange' : 'settings.backupChoose')}
        </button>
        {backupDir && (
          <button className="text-btn" onClick={() => void boardLibrary.disableBackup()}>
            {t('settings.backupDisable')}
          </button>
        )}
      </div>
    </>
  )
}
