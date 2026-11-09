import test from 'node:test';
import assert from 'node:assert/strict';
import { GITHUB_STATE_OWNER, GITHUB_STATE_REPOSITORY } from '../src/state/types.ts';
import { syncMergeScreen, syncNoticeScreen, syncPanelScreen, syncRecoveryScreen, syncStatusScreen, syncTokenFormWords } from '../src/screens/sync.js';

// Sync's words only (ADR 003, K6). These models read facts and never call, send or store anything.
const clock = ms => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const at = Date.UTC(2026, 9, 21, 18, 5);
const sync = (extra = {}) => ({ status: 'ready', message: '', pending: 0, hasToken: false, writeError: null, tokenRejected: false, reviewPending: false, retryAt: null, lastSentAt: null, lastReadAt: null, readSource: null, recovery: null, ...extra });
const panel = extra => syncPanelScreen({ sync: sync(extra), host: 'titanlar-com.github.io' });

test('the panel titles the state it is in, and trouble comes before being connected', () => {
 assert.equal(panel({ status: 'saving', hasToken: true }).alert.title, 'Kaydediliyor');
 assert.equal(panel({ status: 'queued', hasToken: true }).alert.title, 'Gönderim bekliyor');
 assert.equal(panel({ status: 'error', hasToken: true }).alert.title, 'Dikkat');
 assert.equal(panel({ hasToken: true }).alert.title, 'Yazma bağlı');
 assert.equal(panel().alert.title, 'Salt okunur');
});

test('the panel adds how many changes wait only when some do', () => {
 assert.equal(panel().alert.pendingNote, '');
 assert.equal(panel({ pending: 3 }).alert.pendingNote, ' 3 değişiklik gönderilmeyi bekliyor.');
});

test('the last read and send are said only once they have happened, so a stale copy never looks fresh', () => {
 assert.equal(panel().activity, null);
 assert.equal(panel({ lastReadAt: at, readSource: 'cdn' }).activity, `Son okuma saat ${clock(at)}. Kaynak GitHub önbelleği, en çok beş dakika gecikebilir.`);
 assert.equal(panel({ lastReadAt: at, readSource: 'api' }).activity, `Son okuma saat ${clock(at)}. Kaynak GitHub.`);
 assert.equal(panel({ lastSentAt: at }).activity, `Son gönderim saat ${clock(at)}.`);
 assert.equal(panel({ lastReadAt: at, readSource: 'api', lastSentAt: at }).activity, `Son okuma saat ${clock(at)}. Kaynak GitHub. Son gönderim saat ${clock(at)}.`);
});

test('the panel names itself and says what becomes public', () => {
 const model = panel();
 assert.equal(model.title, 'Cihazlar arası eşitleme');
 assert.equal(model.intro, 'Favoriler, kitaplık, okuma durumları, sıra, tarihler, ilerleme ve notlar herkese açık kitaps-state deposunda ve onun GitHub geçmişinde görünür. Bir cihazdaki değişiklik ancak o cihaz bağlıysa diğer cihazlara ulaşır. Bağlı cihaz değişiklikleri sayfadan ayrılırken ya da ilk değişiklikten 30 saniye sonra tek güncellemeyle gönderir. Açık sayfa ortak kaydı 30 saniyede bir yeniden okur.');
 assert.deepEqual(model.actions, { send: 'Şimdi gönder', reload: 'GitHub’dan yenile', removeKey: 'Anahtarı kaldır' });
});

test('the connect form walks through the four steps, naming the owner and the repository', () => {
 const { connect } = panel();
 assert.equal(connect.title, 'Bu cihazı bağla');
 assert.equal(connect.doneNote, ' (tamamlandı)');
 assert.deepEqual(connect.steps.map(step => step.label), ['Anahtarı oluştur', 'Sahibi seç', 'Depoyu seç', 'Anahtarı yapıştır']);
 const [create, owner, repository, paste] = connect.steps;
 assert.deepEqual(create.link, { text: 'Anahtarı hazır ayarlarla ', end: 'oluştur' });
 assert.equal(create.description, ` Form, sahibi ${GITHUB_STATE_OWNER} olarak, Contents yazma izniyle ve 90 gün süreyle açılır.`);
 assert.equal(owner.link, null);
 assert.equal(owner.description, `Resource owner olarak ${GITHUB_STATE_OWNER} seçili kalsın. Kişisel hesabına bağlı bir anahtar bu depoya yazamaz, önceki anahtarın için de bu geçerlidir. Kuruluş yeni anahtarları onaya bağlıyorsa anahtar, bir kuruluş sahibi onaylayınca yazabilir. Onaydan sonra anahtarı yeniden yapıştır.`);
 assert.equal(repository.description, `Repository access bölümünde “Only select repositories” seç ve yalnız ${GITHUB_STATE_REPOSITORY} deposunu işaretle. Contents iznini “Read and write” bırak ve başka izin ekleme.`);
 assert.equal(paste.description, 'Anahtarı aşağıdaki alana yapıştır. Aynı anahtarı telefonda da kullanabilirsin. Anahtarı e-posta ya da mesajla gönderme. Telefonda yeniden oluştur veya cihazlar arası güvenli kopyala-yapıştır kullan.');
});

test('the connect form says what kind of key it takes and where the key is kept', () => {
 const { connect } = panel();
 assert.deepEqual(connect.tokenField, { label: 'İnce ayarlı (fine-grained) GitHub anahtarı', description: 'github_pat_ ile başlar. Klasik ve OAuth anahtarları kabul edilmez. Anahtar kaydedilmeden önce GitHub ile okuma ve yazma izni denetlenir.' });
 assert.equal(connect.submit, 'Bu cihazda bağla');
 assert.equal(connect.storageNote, 'Anahtar bu tarayıcıda saklanır. titanlar-com.github.io altındaki diğer sayfalar aynı tarayıcı alanını paylaştığı için yalnız bu depoya yetkili, süreli bir anahtar kullan.');
 assert.equal(panel().reload, 'GitHub’dan yenile');
});

test('the key form on GitHub is named for this site and this repository alone', () => {
 assert.deepEqual(syncTokenFormWords, { name: 'Kitaplık eşitleme', description: `Yalnız ${GITHUB_STATE_OWNER}/${GITHUB_STATE_REPOSITORY}: Contents read and write` });
});

const asked = (extra = {}) => ({ reason: 'first-sync', conflicts: ['a', 'b'], queueConflict: false, ...extra });
const merge = (prompt, hasBackup = false) => syncMergeScreen({ asked: prompt, hasBackup });

test('the merge question says what differs: books, the queue, or both', () => {
 assert.match(merge(asked()).body, /^Bu cihazda 2 kitabın kaydı, GitHub’daki/);
 assert.match(merge(asked({ conflicts: [], queueConflict: true })).body, /^Bu cihazda okuma sıran, GitHub’daki/);
 assert.match(merge(asked({ queueConflict: true })).body, /^Bu cihazda 2 kitabın kaydı ve okuma sıran, GitHub’daki/);
});

test('the merge question explains itself differently on a first read and on a connect', () => {
 assert.equal(merge(asked()).body, 'Bu cihazda 2 kitabın kaydı, GitHub’daki ortak kayıttan farklı. Hangisinin kalacağını seç. Seçim yalnız bu farklı kayıtları etkiler. Yalnız bu cihazda olan kayıtlar ayrıca ortak kayda eklenir.');
 assert.equal(merge(asked({ reason: 'connect', conflicts: ['a'] })).body, 'Bu cihaz bağlı değilken 1 kitabın kaydı değişti. Bu arada başka bir cihaz aynı kayıtları farklı kaydetti. Hangisinin kalacağını seç. Seçim yalnız bu kayıtları etkiler. Bu cihazın öteki değişiklikleri seçimden sonra gönderilir.');
});

test('with no question asked the dialog keeps its title and has no sentence', () => {
 const model = merge(undefined);
 assert.equal(model.title, 'Bu cihazdaki kayıtlar farklı');
 assert.equal(model.body, null);
});

test('the merge dialog offers both sides, and the backup only when one was taken', () => {
 const without = merge(asked());
 assert.deepEqual([without.useDevice, without.useShared], ['Bu cihazdakini kullan', 'GitHub’dakini kullan']);
 assert.deepEqual([without.backupNote, without.download], [null, null]);
 const withBackup = merge(asked(), true);
 assert.equal(withBackup.backupNote, 'Seçimden önce bu cihazdaki kayıtların yedeği alındı.');
 assert.deepEqual(withBackup.download, { text: 'Yedeği indir', file: 'kitaplik-esitleme-oncesi-yedek.json' });
});

test('no warning means no words', () => {
 assert.equal(syncNoticeScreen({ kind: null, sync: sync() }), null);
});

test('the warning for changes that cannot leave the device offers to connect it', () => {
 assert.deepEqual(syncNoticeScreen({ kind: 'local', sync: sync({ pending: 2 }) }), {
  title: 'Bu cihazdaki işaretler yalnız burada',
  body: '2 değişiklik bu cihazda bekliyor. Bu cihaz bağlanana kadar bu işaretler diğer cihazlarda görünmez. Bağladığında hepsi hemen gönderilir.',
  action: 'Bu cihazı bağla',
  dismiss: 'Şimdilik gizle',
 });
});

test('the warning for a refused write repeats what GitHub said and opens the details', () => {
 assert.deepEqual(syncNoticeScreen({ kind: 'failed', sync: sync({ pending: 2, writeError: 'GitHub reddetti.' }) }), {
  title: 'Değişiklikler GitHub’a gönderilemedi',
  body: 'GitHub reddetti. 2 değişiklik bu cihazda bekliyor.',
  action: 'Eşitleme ayrıntıları',
  dismiss: 'Şimdilik gizle',
 });
});

test('the warning for a damaged queue says what was kept', () => {
 const notice = recovery => syncNoticeScreen({ kind: 'recovery', sync: sync({ recovery }) });
 assert.equal(notice({ kept: 2, stored: true }).title, 'Bekleyen değişikliklerin kaydı tam okunamadı');
 assert.equal(notice({ kept: 2, stored: true }).body, 'Okunabilen değişiklikler kuyrukta kaldı ve kaydın bir kopyası bu tarayıcıda saklanıyor. Kopyayı eşitleme ayrıntılarından indirebilirsin.');
 assert.equal(notice({ kept: 0, stored: true }).body, 'Kaydın bir kopyası bu tarayıcıda saklanıyor. Kopyayı eşitleme ayrıntılarından indirebilirsin.');
 assert.equal(notice({ kept: 2, stored: false }).body, 'Tarayıcının alanı dolu. Kayıt olduğu yerde duruyor ve yeni değişiklikler kuyruğa yazılamıyor. Kaydı eşitleme ayrıntılarından indirebilirsin.');
 assert.equal(notice({ kept: 0, stored: true }).action, 'Eşitleme ayrıntıları');
});

test('the recovery alert says what a damaged queue left, in all four cases', () => {
 const body = (kept, stored) => syncRecoveryScreen({ kept, stored }).body;
 const saved = 'Kaydın bulunduğu hâliyle bir kopyası bu tarayıcıda saklanıyor. Kopyayı indirip saklayabilir, gerekmiyorsa silebilirsin.';
 const full = 'Tarayıcının alanı dolu olduğu için kopya ayrıca saklanamadı. Kayıt olduğu yerde duruyor ve o silinene ya da yer açılana kadar yeni değişiklikler kuyruğa yazılamaz. Kaydı indirip saklayabilir, sonra silebilirsin.';
 const some = 'Bu cihazda gönderilmeyi bekleyen değişikliklerin kaydı bozulmuş. Okunabilen 2 değişiklik kuyrukta kaldı.';
 const none = 'Bu cihazda gönderilmeyi bekleyen değişikliklerin kaydı bozulmuş ve kayıttaki değişikliklerin hiçbiri okunamadı.';
 assert.equal(body(2, true), `${some} ${saved}`);
 assert.equal(body(2, false), `${some} ${full}`);
 assert.equal(body(0, true), `${none} ${saved}`);
 assert.equal(body(0, false), `${none} ${full}`);
});

test('the recovery alert calls the thing a copy when one was kept aside and a record when not', () => {
 const copy = syncRecoveryScreen({ kept: 1, stored: true });
 assert.deepEqual([copy.title, copy.download, copy.remove, copy.confirm], ['Bekleyen değişikliklerin kaydı tam okunamadı', 'Kopyayı indir', 'Kopyayı sil', 'Kopya bu tarayıcıdan kalıcı olarak silinir.']);
 const record = syncRecoveryScreen({ kept: 1, stored: false });
 assert.deepEqual([record.download, record.remove, record.confirm], ['Kaydı indir', 'Kaydı sil', 'Kayıt bu tarayıcıdan kalıcı olarak silinir. Okunabilen değişiklikler kuyrukta kalır.']);
 assert.deepEqual([copy.yes, copy.no, copy.file], ['Evet, sil', 'Vazgeç', 'kitaplik-bekleyen-degisiklikler.json']);
});

test('the status line says nothing before there is something to say', () => {
 assert.deepEqual(syncStatusScreen({ kind: null, sync: sync() }), { text: null, action: null });
});

test('the status line tells where this device stands, and offers a way out only when stuck', () => {
 const line = (kind, extra) => syncStatusScreen({ kind, sync: sync(extra) });
 assert.deepEqual(line('local', { pending: 2 }), { text: '2 değişiklik yalnız bu cihazda kayıtlı. Diğer cihazlarda görünmesi için bu cihazı bağla.', action: 'Bu cihazı bağla' });
 assert.deepEqual(line('failed', { pending: 2 }), { text: 'GitHub’a gönderilemedi. 2 değişiklik bu cihazda bekliyor.', action: 'Eşitleme ayrıntıları' });
 assert.deepEqual(line('failed', { tokenRejected: true }), { text: 'GitHub bu cihazın anahtarını reddetti. Bu cihazı yeniden bağla.', action: 'Eşitleme ayrıntıları' });
 assert.deepEqual(line('saving', { pending: 2 }), { text: 'Değişiklikler GitHub’a gönderiliyor.', action: null });
 assert.deepEqual(line('sent', { lastSentAt: at }), { text: `GitHub’a gönderildi (saat ${clock(at)}).`, action: null });
});

test('a queued change says what it is waiting for', () => {
 const queued = extra => syncStatusScreen({ kind: 'queued', sync: sync({ pending: 1, ...extra }) });
 assert.equal(queued({ reviewPending: true, retryAt: at }).text, 'Bu cihazın kayıtları GitHub’dakiyle karşılaştırıldıktan sonra gönderilecek.');
 assert.equal(queued({ retryAt: at }).text, `GitHub’ın istediği bekleme bitince, ${clock(at)} sonrasında gönderilecek.`);
 assert.equal(queued().text, 'GitHub’a gönderilecek: ilk değişiklikten 30 saniye sonra ya da sayfadan ayrılınca.');
 assert.equal(queued().action, null);
});
