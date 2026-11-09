import { GITHUB_STATE_OWNER, GITHUB_STATE_REPOSITORY } from '../state/types.ts';

// The words of the sync panel, its dialog and its notices (ADR 003, K6). These functions read the
// facts the screens hold and say them in Turkish. They never call, send or store anything: when
// something happens stays with the components and src/core/sync. The controller's own messages
// are in src/core/text.js.
const clock = ms => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/** The fields of GitHub's key form that the site fills in with words. */
export const syncTokenFormWords = { name: 'Kitaplık eşitleme', description: `Yalnız ${GITHUB_STATE_OWNER}/${GITHUB_STATE_REPOSITORY}: Contents read and write` };

const stateTitle = sync => (sync.status === 'saving' ? 'Kaydediliyor' : sync.status === 'queued' ? 'Gönderim bekliyor' : sync.status === 'error' ? 'Dikkat' : sync.hasToken ? 'Yazma bağlı' : 'Salt okunur');

// What the last read and write were, so a stale copy is never presented as fresh.
const lastActivity = sync => [
 sync.lastReadAt && `Son okuma saat ${clock(sync.lastReadAt)}. Kaynak ${sync.readSource === 'cdn' ? 'GitHub önbelleği, en çok beş dakika gecikebilir' : 'GitHub'}.`,
 sync.lastSentAt && `Son gönderim saat ${clock(sync.lastSentAt)}.`,
].filter(Boolean).join(' ') || null;

const CONNECT_STEPS = [
 { label: 'Anahtarı oluştur', link: { text: 'Anahtarı hazır ayarlarla ', end: 'oluştur' }, description: ` Form, sahibi ${GITHUB_STATE_OWNER} olarak, Contents yazma izniyle ve 90 gün süreyle açılır.` },
 { label: 'Sahibi seç', link: null, description: `Resource owner olarak ${GITHUB_STATE_OWNER} seçili kalsın. Kişisel hesabına bağlı bir anahtar bu depoya yazamaz, önceki anahtarın için de bu geçerlidir. Kuruluş yeni anahtarları onaya bağlıyorsa anahtar, bir kuruluş sahibi onaylayınca yazabilir. Onaydan sonra anahtarı yeniden yapıştır.` },
 { label: 'Depoyu seç', link: null, description: `Repository access bölümünde “Only select repositories” seç ve yalnız ${GITHUB_STATE_REPOSITORY} deposunu işaretle. Contents iznini “Read and write” bırak ve başka izin ekleme.` },
 { label: 'Anahtarı yapıştır', link: null, description: 'Anahtarı aşağıdaki alana yapıştır. Aynı anahtarı telefonda da kullanabilirsin. Anahtarı e-posta ya da mesajla gönderme. Telefonda yeniden oluştur veya cihazlar arası güvenli kopyala-yapıştır kullan.' },
];

export function syncPanelScreen({ sync, host }) {
 return {
  title: 'Cihazlar arası eşitleme',
  alert: { title: stateTitle(sync), pendingNote: sync.pending ? ` ${sync.pending} değişiklik gönderilmeyi bekliyor.` : '' },
  activity: lastActivity(sync),
  intro: 'Favoriler, kitaplık, okuma durumları, sıra, tarihler, ilerleme ve notlar herkese açık kitaps-state deposunda ve onun GitHub geçmişinde görünür. Bir cihazdaki değişiklik ancak o cihaz bağlıysa diğer cihazlara ulaşır. Bağlı cihaz değişiklikleri sayfadan ayrılırken ya da ilk değişiklikten 30 saniye sonra tek güncellemeyle gönderir. Açık sayfa ortak kaydı 30 saniyede bir yeniden okur.',
  actions: { send: 'Şimdi gönder', reload: 'GitHub’dan yenile', removeKey: 'Anahtarı kaldır' },
  reload: 'GitHub’dan yenile',
  connect: {
   title: 'Bu cihazı bağla',
   doneNote: ' (tamamlandı)',
   steps: CONNECT_STEPS,
   tokenField: { label: 'İnce ayarlı (fine-grained) GitHub anahtarı', description: 'github_pat_ ile başlar. Klasik ve OAuth anahtarları kabul edilmez. Anahtar kaydedilmeden önce GitHub ile okuma ve yazma izni denetlenir.' },
   submit: 'Bu cihazda bağla',
   storageNote: `Anahtar bu tarayıcıda saklanır. ${host} altındaki diğer sayfalar aynı tarayıcı alanını paylaştığı için yalnız bu depoya yetkili, süreli bir anahtar kullan.`,
  },
 };
}

const mergeParts = asked => [asked.conflicts.length ? `${asked.conflicts.length} kitabın kaydı` : '', asked.queueConflict ? 'okuma sıran' : ''].filter(Boolean).join(' ve ');

const mergeBody = asked => (asked.reason === 'connect'
 ? `Bu cihaz bağlı değilken ${mergeParts(asked)} değişti. Bu arada başka bir cihaz aynı kayıtları farklı kaydetti. Hangisinin kalacağını seç. Seçim yalnız bu kayıtları etkiler. Bu cihazın öteki değişiklikleri seçimden sonra gönderilir.`
 : `Bu cihazda ${mergeParts(asked)}, GitHub’daki ortak kayıttan farklı. Hangisinin kalacağını seç. Seçim yalnız bu farklı kayıtları etkiler. Yalnız bu cihazda olan kayıtlar ayrıca ortak kayda eklenir.`);

/** The merge question. `asked` is the question on screen, or nothing before the first one. */
export const syncMergeScreen = ({ asked, hasBackup }) => ({
 title: 'Bu cihazdaki kayıtlar farklı',
 body: asked ? mergeBody(asked) : null,
 backupNote: hasBackup ? 'Seçimden önce bu cihazdaki kayıtların yedeği alındı.' : null,
 useDevice: 'Bu cihazdakini kullan',
 useShared: 'GitHub’dakini kullan',
 download: hasBackup ? { text: 'Yedeği indir', file: 'kitaplik-esitleme-oncesi-yedek.json' } : null,
});

const RECOVERY_TITLE = 'Bekleyen değişikliklerin kaydı tam okunamadı';

/** The page notice's words for what a damaged pending queue left (`sync.recovery`). */
const recoveryNoticeText = ({ kept, stored }) => (stored
 ? `${kept ? 'Okunabilen değişiklikler kuyrukta kaldı ve kaydın' : 'Kaydın'} bir kopyası bu tarayıcıda saklanıyor. Kopyayı eşitleme ayrıntılarından indirebilirsin.`
 : 'Tarayıcının alanı dolu. Kayıt olduğu yerde duruyor ve yeni değişiklikler kuyruğa yazılamıyor. Kaydı eşitleme ayrıntılarından indirebilirsin.');

const NOTICE = {
 local: sync => ({ title: 'Bu cihazdaki işaretler yalnız burada', body: `${sync.pending} değişiklik bu cihazda bekliyor. Bu cihaz bağlanana kadar bu işaretler diğer cihazlarda görünmez. Bağladığında hepsi hemen gönderilir.` }),
 failed: sync => ({ title: 'Değişiklikler GitHub’a gönderilemedi', body: `${sync.writeError} ${sync.pending} değişiklik bu cihazda bekliyor.` }),
 recovery: sync => ({ title: RECOVERY_TITLE, body: recoveryNoticeText(sync.recovery) }),
};

/** The words of the page notice for one kind of warning, or null when there is no warning. */
export const syncNoticeScreen = ({ kind, sync }) => (kind
 ? { ...NOTICE[kind](sync), action: kind === 'local' ? 'Bu cihazı bağla' : 'Eşitleme ayrıntıları', dismiss: 'Şimdilik gizle' }
 : null);

export const syncRecoveryScreen = ({ kept, stored }) => ({
 title: RECOVERY_TITLE,
 body: `${kept ? `Bu cihazda gönderilmeyi bekleyen değişikliklerin kaydı bozulmuş. Okunabilen ${kept} değişiklik kuyrukta kaldı.` : 'Bu cihazda gönderilmeyi bekleyen değişikliklerin kaydı bozulmuş ve kayıttaki değişikliklerin hiçbiri okunamadı.'} ${stored
  ? 'Kaydın bulunduğu hâliyle bir kopyası bu tarayıcıda saklanıyor. Kopyayı indirip saklayabilir, gerekmiyorsa silebilirsin.'
  : 'Tarayıcının alanı dolu olduğu için kopya ayrıca saklanamadı. Kayıt olduğu yerde duruyor ve o silinene ya da yer açılana kadar yeni değişiklikler kuyruğa yazılamaz. Kaydı indirip saklayabilir, sonra silebilirsin.'}`,
 confirm: stored ? 'Kopya bu tarayıcıdan kalıcı olarak silinir.' : 'Kayıt bu tarayıcıdan kalıcı olarak silinir. Okunabilen değişiklikler kuyrukta kalır.',
 yes: 'Evet, sil',
 no: 'Vazgeç',
 download: stored ? 'Kopyayı indir' : 'Kaydı indir',
 remove: stored ? 'Kopyayı sil' : 'Kaydı sil',
 file: 'kitaplik-bekleyen-degisiklikler.json',
});

const STATUS_TEXT = {
 local: sync => `${sync.pending} değişiklik yalnız bu cihazda kayıtlı. Diğer cihazlarda görünmesi için bu cihazı bağla.`,
 failed: sync => (sync.pending ? `GitHub’a gönderilemedi. ${sync.pending} değişiklik bu cihazda bekliyor.` : 'GitHub bu cihazın anahtarını reddetti. Bu cihazı yeniden bağla.'),
 saving: () => 'Değişiklikler GitHub’a gönderiliyor.',
 queued: sync => (sync.reviewPending ? 'Bu cihazın kayıtları GitHub’dakiyle karşılaştırıldıktan sonra gönderilecek.'
  : sync.retryAt ? `GitHub’ın istediği bekleme bitince, ${clock(sync.retryAt)} sonrasında gönderilecek.`
   : 'GitHub’a gönderilecek: ilk değişiklikten 30 saniye sonra ya da sayfadan ayrılınca.'),
 sent: sync => `GitHub’a gönderildi (saat ${clock(sync.lastSentAt)}).`,
};

/** The words of the status line for one kind of state, chosen by the component (syncStatusKind). */
export const syncStatusScreen = ({ kind, sync }) => ({
 text: kind ? STATUS_TEXT[kind](sync) : null,
 action: kind === 'local' ? 'Bu cihazı bağla' : kind === 'failed' ? 'Eşitleme ayrıntıları' : null,
});
