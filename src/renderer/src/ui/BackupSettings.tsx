import { useT } from '../../../board/i18n'
import { useUI } from '../../../board/store'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'

export function BackupSettings() {
  const t = useT()
  const backupDir = useUI((s) => s.library.backupDir)
  if (!platform.capabilities.backup) return null
  return (
    <>
      <div className="popover-title section">{t('settings.backup')}</div>
      <p className="settings-hint">{t('settings.backupHint')}</p>
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
