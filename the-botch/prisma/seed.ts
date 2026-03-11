import { PrismaClient, WarikanStatus } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================================
// 固定UUID（冪等性のため決定論的）
// ============================================================
const MEMBER_IDS = {
  'ゆうき': '00000000-0000-4000-a000-000000000001',
  'ゆうへい': '00000000-0000-4000-a000-000000000002',
  'おかじ': '00000000-0000-4000-a000-000000000003',
  'もりや': '00000000-0000-4000-a000-000000000004',
  'けいすけ': '00000000-0000-4000-a000-000000000005',
  'たからい': '00000000-0000-4000-a000-000000000006',
} as const

type MemberName = keyof typeof MEMBER_IDS

// ============================================================
// メンバーデータ
// ============================================================
type MemberSeed = {
  name: MemberName
  fullName: string
  initial: string
  colorBg: string
  colorText: string
  paypayId: string
}

const MEMBERS: MemberSeed[] = [
  { name: 'ゆうき', fullName: '内山', initial: 'Y', colorBg: 'bg-amber-100', colorText: 'text-amber-700', paypayId: '@yuki_uchiyama' },
  { name: 'ゆうへい', fullName: '大崎', initial: 'Y', colorBg: 'bg-blue-100', colorText: 'text-blue-700', paypayId: '@yuhei_osaki' },
  { name: 'おかじ', fullName: '岡嶋', initial: 'O', colorBg: 'bg-green-100', colorText: 'text-green-700', paypayId: '@okaji_k' },
  { name: 'もりや', fullName: '森屋', initial: 'M', colorBg: 'bg-purple-100', colorText: 'text-purple-700', paypayId: '@moriya_s' },
  { name: 'けいすけ', fullName: '渡邊', initial: 'K', colorBg: 'bg-red-100', colorText: 'text-red-700', paypayId: '@keisuke_w' },
  { name: 'たからい', fullName: '宝井', initial: 'T', colorBg: 'bg-gray-100', colorText: 'text-gray-400', paypayId: '@takarai_t' },
]

// ============================================================
// 漢気データ（161件）
// ============================================================
type OtokogiSeed = {
  id: number
  date: string
  month: number
  event: string
  payer: MemberName
  amount: number
  participants: MemberName[]
  place: string
  album: boolean
  year: number
}

const OTOKOGI_DATA: OtokogiSeed[] = [
  { id: 1, date: '1/7', month: 1, event: 'chapter', payer: 'ゆうへい', amount: 17700, participants: ['ゆうき', 'ゆうへい', 'もりや'], place: '中目黒', album: true, year: 2024 },
  { id: 2, date: '1/27', month: 1, event: '叙々苑', payer: 'おかじ', amount: 46000, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '渋谷', album: false, year: 2024 },
  { id: 3, date: '1/27', month: 1, event: '飲み', payer: 'ゆうへい', amount: 18000, participants: ['ゆうき', 'ゆうへい', 'もりや', 'けいすけ'], place: '恵比寿横丁', album: false, year: 2024 },
  { id: 4, date: '1/27', month: 1, event: 'カラオケ', payer: 'ゆうき', amount: 37000, participants: ['ゆうき', 'ゆうへい', 'もりや', 'けいすけ'], place: '不明', album: true, year: 2024 },
  { id: 5, date: '2/2', month: 2, event: '中華', payer: 'おかじ', amount: 16355, participants: ['ゆうへい', 'おかじ', 'もりや'], place: '不明', album: true, year: 2024 },
  { id: 6, date: '2/17', month: 2, event: 'by the pool', payer: 'ゆうき', amount: 18100, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'けいすけ'], place: '池尻・三宿', album: true, year: 2024 },
  { id: 7, date: '2/17', month: 2, event: 'wanderlust', payer: 'ゆうへい', amount: 15000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻・三宿', album: true, year: 2024 },
  { id: 8, date: '4/21', month: 4, event: '五鉄熱海', payer: 'けいすけ', amount: 15700, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '熱海', album: true, year: 2024 },
  { id: 9, date: '5/10', month: 5, event: '金武アグーしゃぶしゃぶ', payer: 'ゆうき', amount: 22940, participants: ['ゆうき', 'ゆうへい', 'もりや'], place: '那覇', album: true, year: 2024 },
  { id: 10, date: '5/10', month: 5, event: 'CLUB NAHA', payer: 'もりや', amount: 60000, participants: ['ゆうき', 'ゆうへい', 'もりや', 'けいすけ'], place: '那覇', album: true, year: 2024 },
  { id: 11, date: '5/18', month: 5, event: 'CANA', payer: 'ゆうへい', amount: 19930, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '葉山', album: true, year: 2024 },
  { id: 12, date: '5/19', month: 5, event: '(フットサル後のスパ)', payer: 'ゆうき', amount: 26000, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '不明', album: true, year: 2024 },
  { id: 13, date: '5/19', month: 5, event: 'LZA', payer: 'ゆうへい', amount: 24970, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '下北沢', album: true, year: 2024 },
  { id: 14, date: '5/19', month: 5, event: 'おかじまハッピーシーシャ', payer: 'もりや', amount: 17600, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '不明', album: false, year: 2024 },
  { id: 15, date: '6/1', month: 6, event: 'とりやき家すみれ', payer: 'ゆうき', amount: 16137, participants: ['ゆうき', 'ゆうへい'], place: '学芸大学', album: true, year: 2024 },
  { id: 16, date: '6/7', month: 6, event: '玄鮨', payer: 'もりや', amount: 30900, participants: ['おかじ', 'もりや'], place: '新代田', album: true, year: 2024 },
  { id: 17, date: '6/8', month: 6, event: 'route 1', payer: 'けいすけ', amount: 20900, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻・三宿', album: true, year: 2024 },
  { id: 18, date: '6/23', month: 6, event: '学大のカラオケバー', payer: 'ゆうき', amount: 30970, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '学芸大学', album: true, year: 2024 },
  { id: 19, date: '6/30', month: 6, event: 'Volks', payer: 'ゆうき', amount: 25861, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '下北沢', album: true, year: 2024 },
  { id: 20, date: '7/5', month: 7, event: 'Burger Police', payer: 'ゆうき', amount: 24680, participants: ['ゆうき', 'もりや', 'けいすけ'], place: '学芸大学', album: true, year: 2024 },
  { id: 21, date: '7/12', month: 7, event: 'カラオケ39', payer: 'ゆうへい', amount: 51000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻', album: false, year: 2024 },
  { id: 22, date: '7/15', month: 7, event: 'J', payer: 'ゆうき', amount: 15448, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '平和島', album: false, year: 2024 },
  { id: 23, date: '7/19', month: 7, event: 'songbook', payer: 'おかじ', amount: 37190, participants: ['おかじ', 'もりや'], place: '世田谷代田', album: true, year: 2024 },
  { id: 24, date: '7/30', month: 7, event: 'ロイヤルホスト', payer: 'もりや', amount: 23133, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '馬事公苑', album: true, year: 2024 },
  { id: 25, date: '8/3', month: 8, event: 'インフィニティバー', payer: 'ゆうへい', amount: 26874, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: 'グアム', album: true, year: 2024 },
  { id: 26, date: '8/3', month: 8, event: 'たしぐりる', payer: 'けいすけ', amount: 35890, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: 'グアム', album: true, year: 2024 },
  { id: 27, date: '8/10', month: 8, event: 'チャメ', payer: 'ゆうき', amount: 20850, participants: ['ゆうき', 'ゆうへい', 'おかじ'], place: '恵比寿', album: true, year: 2024 },
  { id: 28, date: '8/21', month: 8, event: 'フォルクス', payer: 'ゆうへい', amount: 17160, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '上野毛', album: true, year: 2024 },
  { id: 29, date: '8/23', month: 8, event: 'カラオケバー　39', payer: 'ゆうき', amount: 45000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻大橋', album: true, year: 2024 },
  { id: 30, date: '8/23', month: 8, event: 'カラオケバー wonderlust', payer: 'けいすけ', amount: 15500, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '三宿', album: true, year: 2024 },
  { id: 31, date: '9/7', month: 9, event: '韓国飯', payer: 'もりや', amount: 18601, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '韓国', album: true, year: 2024 },
  { id: 32, date: '9/11', month: 9, event: 'カラオケバー wonderlust', payer: 'けいすけ', amount: 32850, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '三宿', album: true, year: 2024 },
  { id: 33, date: '9/27', month: 9, event: 'ロイヤルホスト', payer: 'ゆうへい', amount: 22341, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '馬事公苑', album: true, year: 2024 },
  { id: 34, date: '9/28', month: 9, event: 'もへじ', payer: 'ゆうき', amount: 16071, participants: ['ゆうき', 'おかじ', 'もりや'], place: '三軒茶屋', album: true, year: 2024 },
  { id: 35, date: '10/18', month: 10, event: 'Panda', payer: 'ゆうへい', amount: 22000, participants: ['ゆうき', 'ゆうへい', 'おかじ'], place: '代官山', album: true, year: 2024 },
  { id: 36, date: '10/18', month: 10, event: 'chapter', payer: 'ゆうき', amount: 35000, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '中目黒', album: true, year: 2024 },
  { id: 37, date: '10/18', month: 10, event: 'バー　ユイ', payer: 'おかじ', amount: 105000, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '中目黒', album: true, year: 2024 },
  { id: 38, date: '10/24', month: 10, event: 'スシとおでんほたる', payer: 'もりや', amount: 37488, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '赤羽', album: true, year: 2024 },
  { id: 39, date: '10/25', month: 10, event: '羅生門', payer: 'ゆうき', amount: 28655, participants: ['ゆうき', 'ゆうへい'], place: '青山', album: true, year: 2024 },
  { id: 40, date: '10/25', month: 10, event: 'オオハマル', payer: 'ゆうき', amount: 27400, participants: ['ゆうき', 'おかじ'], place: '下北沢', album: true, year: 2024 },
  { id: 41, date: '10/25', month: 10, event: 'The Top', payer: 'ゆうき', amount: 21920, participants: ['ゆうき', 'ゆうへい'], place: '青山', album: true, year: 2024 },
  { id: 42, date: '11/5', month: 11, event: 'スポルカチョーネ', payer: 'ゆうへい', amount: 42490, participants: ['ゆうへい', 'おかじ'], place: '明大前', album: true, year: 2025 },
  { id: 43, date: '11/15', month: 11, event: '416GRILLING', payer: 'もりや', amount: 11650, participants: ['ゆうき', 'ゆうへい', 'もりや'], place: '学芸大学', album: true, year: 2025 },
  { id: 44, date: '11/16', month: 11, event: 'INC', payer: 'ゆうへい', amount: 16322, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '渋谷', album: true, year: 2025 },
  { id: 45, date: '11/17', month: 11, event: 'ワンダーラスト', payer: 'ゆうき', amount: 15200, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 46, date: '11/23', month: 11, event: 'ガラムマサラ', payer: 'けいすけ', amount: 13035, participants: ['ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '経堂', album: true, year: 2025 },
  { id: 47, date: '11/24', month: 11, event: 'ケルベロス', payer: 'ゆうへい', amount: 25619, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 48, date: '11/29', month: 11, event: 'StaffOnly', payer: 'ゆうき', amount: 28820, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '池尻', album: true, year: 2025 },
  { id: 49, date: '11/29', month: 11, event: 'タコスショップ池尻', payer: 'ゆうき', amount: 22000, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '池尻', album: true, year: 2025 },
  { id: 50, date: '11/29', month: 11, event: 'ルート1', payer: 'ゆうき', amount: 13200, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '池尻', album: true, year: 2025 },
  { id: 51, date: '12/4', month: 12, event: 'シモン', payer: 'ゆうき', amount: 23320, participants: ['ゆうき', 'おかじ'], place: '池尻', album: true, year: 2025 },
  { id: 52, date: '12/6', month: 12, event: 'コンコン', payer: 'ゆうへい', amount: 24900, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 53, date: '12/7', month: 12, event: 'シンガポールナイト', payer: 'ゆうき', amount: 22600, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 54, date: '12/7', month: 12, event: 'バーユイ', payer: 'おかじ', amount: 27000, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 55, date: '12/14', month: 12, event: 'TUTU', payer: 'ゆうき', amount: 11250, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'たからい'], place: '学大', album: true, year: 2025 },
  { id: 56, date: '12/14', month: 12, event: '鳥おき', payer: 'けいすけ', amount: 43780, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '学大', album: true, year: 2025 },
  { id: 57, date: '12/20', month: 12, event: '岩岳マウンテンフィールド', payer: 'おかじ', amount: 11600, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '白馬', album: true, year: 2025 },
  { id: 58, date: '12/20', month: 12, event: 'ホセルイス', payer: 'もりや', amount: 45160, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '軽井沢', album: true, year: 2025 },
  { id: 59, date: '12/29', month: 12, event: 'dom', payer: 'ゆうき', amount: 13860, participants: ['ゆうき', 'ゆうへい'], place: '池尻', album: true, year: 2025 },
  { id: 60, date: '12/29', month: 12, event: 'カラオケバー　39', payer: 'ゆうき', amount: 11500, participants: ['ゆうき', 'ゆうへい'], place: '池尻', album: true, year: 2025 },
  { id: 61, date: '12/29', month: 12, event: 'Straffonly', payer: 'ゆうき', amount: 14100, participants: ['ゆうき', 'ゆうへい', 'たからい'], place: '池尻', album: true, year: 2025 },
  { id: 62, date: '12/29', month: 12, event: 'Biski', payer: 'たからい', amount: 16500, participants: ['ゆうき', 'ゆうへい', 'たからい'], place: '池尻', album: true, year: 2025 },
  { id: 63, date: '1/13', month: 1, event: 'がってんずし', payer: 'もりや', amount: 24684, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '川口', album: true, year: 2025 },
  { id: 64, date: '1/13', month: 1, event: 'こぐりょ_焼肉', payer: 'おかじ', amount: 23954, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '川口', album: true, year: 2025 },
  { id: 65, date: '1/14', month: 1, event: '大鴻運天天酒楼', payer: 'けいすけ', amount: 16480, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '学大', album: true, year: 2025 },
  { id: 66, date: '1/18', month: 1, event: '養老の滝', payer: 'ゆうへい', amount: 16574, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'たからい'], place: '学大', album: true, year: 2025 },
  { id: 67, date: '1/18', month: 1, event: 'アチョー', payer: 'ゆうき', amount: 10280, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'たからい'], place: '渋谷', album: true, year: 2025 },
  { id: 68, date: '1/18', month: 1, event: 'THE SG CLUB', payer: 'ゆうき', amount: 10160, participants: ['ゆうき', 'ゆうへい', 'おかじ'], place: '渋谷', album: true, year: 2025 },
  { id: 69, date: '1/18', month: 1, event: 'カラオケバー　39', payer: 'ゆうへい', amount: 13200, participants: ['ゆうき', 'ゆうへい'], place: '三宿', album: true, year: 2025 },
  { id: 70, date: '1/22', month: 1, event: 'うおたん', payer: 'けいすけ', amount: 10710, participants: ['ゆうき'], place: '学芸大学', album: true, year: 2025 },
  { id: 71, date: '1/28', month: 1, event: 'bar percel', payer: 'ゆうき', amount: 10000, participants: ['ゆうき', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 72, date: '2/7', month: 2, event: 'SANKYU本店', payer: 'ゆうき', amount: 10960, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '三宿', album: true, year: 2025 },
  { id: 73, date: '2/7', month: 2, event: 'カラオケバー　39', payer: 'ゆうき', amount: 46400, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '三宿', album: true, year: 2025 },
  { id: 74, date: '2/8', month: 2, event: '大阪王将', payer: 'ゆうき', amount: 10180, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 75, date: '2/15', month: 2, event: 'こぐりょ_焼肉', payer: 'けいすけ', amount: 48224, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '川口', album: true, year: 2025 },
  { id: 76, date: '2/15', month: 2, event: 'スーパー', payer: 'ゆうへい', amount: 15754, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '川口', album: true, year: 2025 },
  { id: 77, date: '2/21', month: 2, event: 'coyacoya', payer: 'ゆうへい', amount: 15400, participants: ['ゆうき', 'ゆうへい'], place: '広尾', album: true, year: 2025 },
  { id: 78, date: '2/28', month: 2, event: 'North Villlage', payer: 'もりや', amount: 13420, participants: ['おかじ', 'もりや'], place: '下北沢', album: true, year: 2025 },
  { id: 79, date: '3/5', month: 3, event: 'あじと', payer: 'おかじ', amount: 30500, participants: ['ゆうき', 'おかじ'], place: '三軒茶屋', album: true, year: 2025 },
  { id: 80, date: '3/7', month: 3, event: 'LZA', payer: 'ゆうき', amount: 48480, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'たからい'], place: '下北沢', album: true, year: 2025 },
  { id: 81, date: '3/7', month: 3, event: 'Quarter Room', payer: 'もりや', amount: 27016, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'たからい'], place: '下北沢', album: true, year: 2025 },
  { id: 82, date: '3/8', month: 3, event: 'イルキャンティ', payer: 'もりや', amount: 19260, participants: ['おかじ', 'もりや'], place: '笹塚', album: true, year: 2025 },
  { id: 83, date: '3/8', month: 3, event: '混混', payer: 'ゆうき', amount: 10000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻大橋', album: true, year: 2025 },
  { id: 84, date: '3/1', month: 3, event: 'The Kitchen', payer: 'おかじ', amount: 16100, participants: ['ゆうへい', 'おかじ', 'もりや'], place: '表参道', album: true, year: 2025 },
  { id: 85, date: '3/20', month: 3, event: '島おき', payer: 'ゆうき', amount: 31130, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '中目黒', album: true, year: 2025 },
  { id: 86, date: '3/21', month: 3, event: 'パリ食堂', payer: 'ゆうき', amount: 23120, participants: ['ゆうき', 'ゆうへい', 'もりや', 'たからい'], place: '中目黒', album: true, year: 2025 },
  { id: 87, date: '3/21', month: 3, event: 'Red', payer: 'もりや', amount: 10100, participants: ['ゆうき', 'ゆうへい', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 88, date: '3/21', month: 3, event: 'カラオケダーツ３９', payer: 'ゆうへい', amount: 13200, participants: ['ゆうき', 'ゆうへい', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 89, date: '4/7', month: 4, event: 'urura', payer: 'ゆうき', amount: 42140, participants: ['ゆうき', 'けいすけ'], place: '神泉', album: true, year: 2025 },
  { id: 90, date: '4/12', month: 4, event: 'Lodge Bistro Saru', payer: 'ゆうへい', amount: 53680, participants: ['ゆうき', 'ゆうへい', 'おかじ'], place: '目黒', album: true, year: 2025 },
  { id: 91, date: '4/25', month: 4, event: 'オーバカナル', payer: 'ゆうき', amount: 16000, participants: ['ゆうき', 'ゆうへい'], place: '学芸大学', album: true, year: 2025 },
  { id: 92, date: '5/18', month: 5, event: 'リトルデリリウムカフェ', payer: 'たからい', amount: 19860, participants: ['もりや', 'たからい'], place: '池袋', album: true, year: 2025 },
  { id: 93, date: '5/25', month: 5, event: '汁べえ', payer: 'もりや', amount: 12350, participants: ['ゆうき', 'おかじ', 'もりや'], place: '下北沢', album: true, year: 2025 },
  { id: 94, date: '5/27', month: 5, event: 'さささのさ', payer: 'おかじ', amount: 29350, participants: ['おかじ', 'もりや'], place: '笹塚', album: true, year: 2025 },
  { id: 95, date: '5/30', month: 5, event: 'OASIS', payer: 'ゆうへい', amount: 13700, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '甲府', album: true, year: 2025 },
  { id: 96, date: '5/30', month: 5, event: 'wander', payer: 'おかじ', amount: 57600, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '甲府', album: true, year: 2025 },
  { id: 97, date: '5/30', month: 5, event: 'Brillar', payer: 'けいすけ', amount: 131700, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '甲府', album: true, year: 2025 },
  { id: 98, date: '5/30', month: 5, event: 'Bar All In', payer: 'ゆうき', amount: 46635, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '甲府', album: true, year: 2025 },
  { id: 99, date: '5/30', month: 5, event: 'オサカナバルPANDA', payer: 'ゆうへい', amount: 11260, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '甲府', album: true, year: 2025 },
  { id: 100, date: '5/30', month: 5, event: 'Fairies', payer: 'もりや', amount: 33400, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '甲府', album: true, year: 2025 },
  { id: 101, date: '6/1', month: 6, event: 'OLDNEW DINER', payer: 'ゆうへい', amount: 18690, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '立川', album: true, year: 2025 },
  { id: 102, date: '6/15', month: 6, event: 'A Moment', payer: 'ゆうき', amount: 12350, participants: ['ゆうき', 'ゆうへい'], place: '恵比寿', album: true, year: 2025 },
  { id: 103, date: '6/15', month: 6, event: '横浜中華', payer: 'けいすけ', amount: 16555, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '横浜中華街', album: true, year: 2025 },
  { id: 104, date: '6/20', month: 6, event: '山都', payer: 'ゆうへい', amount: 23750, participants: ['ゆうき', 'ゆうへい'], place: '代々木上原', album: true, year: 2025 },
  { id: 105, date: '7/12', month: 7, event: 'Wine stand Waltz', payer: 'もりや', amount: 14000, participants: ['ゆうき', 'ゆうへい', 'もりや'], place: '恵比寿', album: true, year: 2025 },
  { id: 106, date: '7/12', month: 7, event: '盤天', payer: 'ゆうき', amount: 15950, participants: ['ゆうき', 'ゆうへい', 'もりや'], place: '恵比寿', album: true, year: 2025 },
  { id: 107, date: '7/12', month: 7, event: '3Park', payer: 'ゆうき', amount: 12000, participants: ['ゆうき', 'ゆうへい', 'もりや'], place: '恵比寿', album: true, year: 2025 },
  { id: 108, date: '7/12', month: 7, event: '小城香', payer: 'けいすけ', amount: 16000, participants: ['ゆうき', 'ゆうへい', 'もりや', 'けいすけ'], place: '恵比寿', album: true, year: 2025 },
  { id: 109, date: '7/13', month: 7, event: 'wanderlust', payer: 'ゆうき', amount: 15500, participants: ['ゆうき', 'ゆうへい', 'もりや', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 110, date: '7/13', month: 7, event: '3MuseTerrace', payer: 'ゆうき', amount: 16000, participants: ['ゆうき', 'けいすけ'], place: '恵比寿', album: true, year: 2025 },
  { id: 111, date: '7/20', month: 7, event: 'YOLO', payer: 'けいすけ', amount: 10300, participants: ['ゆうき', 'けいすけ'], place: '中目黒', album: true, year: 2025 },
  { id: 112, date: '7/26', month: 7, event: 'bills', payer: 'ゆうへい', amount: 19100, participants: ['ゆうき', 'ゆうへい'], place: '七里ヶ浜', album: true, year: 2025 },
  { id: 113, date: '7/26', month: 7, event: '温野菜', payer: 'ゆうき', amount: 12969, participants: ['ゆうき', 'ゆうへい'], place: '三宿', album: true, year: 2025 },
  { id: 114, date: '8/2', month: 8, event: 'Eiffile', payer: 'けいすけ', amount: 10500, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 115, date: '8/2', month: 8, event: 'StaffOnly', payer: 'ゆうき', amount: 32050, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 116, date: '8/2', month: 8, event: '混混', payer: 'ゆうき', amount: 10000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻', album: true, year: 2025 },
  { id: 117, date: '8/2', month: 8, event: '3park', payer: 'けいすけ', amount: 54000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '恵比寿', album: true, year: 2025 },
  { id: 118, date: '8/2', month: 8, event: 'wander', payer: 'ゆうき', amount: 17100, participants: ['ゆうき', 'けいすけ'], place: '三宿', album: true, year: 2025 },
  { id: 119, date: '8/4', month: 8, event: '魚浜', payer: 'けいすけ', amount: 12040, participants: ['ゆうき', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 120, date: '8/16', month: 8, event: 'Peace!!', payer: 'おかじ', amount: 28300, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 121, date: '8/4', month: 8, event: 'チェメ', payer: 'ゆうき', amount: 12330, participants: ['ゆうき', 'ゆうへい'], place: '恵比寿', album: true, year: 2025 },
  { id: 122, date: '8/4', month: 8, event: 'rego', payer: 'ゆうへい', amount: 58300, participants: ['ゆうき', 'ゆうへい'], place: '恵比寿', album: true, year: 2025 },
  { id: 123, date: '9/6', month: 9, event: 'bagus', payer: 'けいすけ', amount: 43930, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '渋谷', album: true, year: 2025 },
  { id: 124, date: '9/6', month: 9, event: '五反田ゴルフクラブ', payer: 'ゆうき', amount: 42200, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '五反田', album: true, year: 2025 },
  { id: 125, date: '9/20', month: 9, event: 'こむぎ', payer: 'たからい', amount: 26315, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '学芸大学', album: true, year: 2025 },
  { id: 126, date: '9/20', month: 9, event: 'Sunny Side Raincolor', payer: 'ゆうへい', amount: 18480, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 127, date: '9/20', month: 9, event: 'Peace!!', payer: 'けいすけ', amount: 12000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 128, date: '9/20', month: 9, event: 'Bar Red', payer: 'けいすけ', amount: 15400, participants: ['ゆうき', 'けいすけ'], place: '三宿', album: true, year: 2025 },
  { id: 129, date: '10/11', month: 10, event: 'SUNNY SIDE RAINCOLER', payer: 'けいすけ', amount: 10120, participants: ['ゆうき', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 130, date: '10/11', month: 10, event: 'Stand Banh Mi', payer: 'ゆうき', amount: 17937, participants: ['ゆうき', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 131, date: '10/11', month: 10, event: 'スポルカチョーネ', payer: 'けいすけ', amount: 102150, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '代田橋', album: true, year: 2025 },
  { id: 132, date: '10/11', month: 10, event: '笹塚ボウル', payer: 'おかじ', amount: 24100, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '笹塚', album: true, year: 2025 },
  { id: 133, date: '10/11', month: 10, event: 'ZETAB', payer: 'ゆうき', amount: 59115, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '学芸大学', album: true, year: 2025 },
  { id: 134, date: '10/25', month: 10, event: '一二三寿司', payer: 'ゆうき', amount: 24750, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '伊藤', album: true, year: 2025 },
  { id: 135, date: '10/25', month: 10, event: 'ローカル魚食振興会', payer: 'ゆうき', amount: 14230, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '伊藤', album: true, year: 2025 },
  { id: 136, date: '10/25', month: 10, event: 'ミラージュ', payer: 'ゆうき', amount: 56400, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '伊藤', album: true, year: 2025 },
  { id: 137, date: '10/25', month: 10, event: 'Granzen', payer: 'もりや', amount: 23500, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '伊藤', album: true, year: 2025 },
  { id: 138, date: '10/25', month: 10, event: 'CREINE', payer: 'けいすけ', amount: 49500, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '伊藤', album: true, year: 2025 },
  { id: 139, date: '10/25', month: 10, event: 'ピザ屋さん', payer: 'もりや', amount: 21500, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '下田', album: true, year: 2025 },
  { id: 140, date: '10/26', month: 10, event: 'まさる', payer: 'ゆうき', amount: 14500, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '熱海', album: true, year: 2025 },
  { id: 141, date: '11/14', month: 11, event: 'HESPERUS', payer: 'ゆうき', amount: 42460, participants: ['ゆうき', 'もりや', 'けいすけ'], place: '学芸大学', album: true, year: 2026 },
  { id: 142, date: '11/22', month: 11, event: '本格餃子 包', payer: 'ゆうき', amount: 18410, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ', 'たからい'], place: '池尻', album: true, year: 2026 },
  { id: 143, date: '11/8', month: 11, event: 'はんさむ', payer: 'もりや', amount: 12870, participants: ['おかじ', 'もりや'], place: '下北沢', album: true, year: 2026 },
  { id: 144, date: '12/6', month: 12, event: 'Bogamari', payer: 'ゆうき', amount: 26150, participants: ['ゆうき', 'ゆうへい'], place: '麻布台', album: true, year: 2026 },
  { id: 145, date: '12/7', month: 12, event: 'Peace', payer: 'ゆうき', amount: 14000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '学芸大学', album: true, year: 2026 },
  { id: 146, date: '12/28', month: 12, event: '海花', payer: 'けいすけ', amount: 12353, participants: ['ゆうへい', 'けいすけ'], place: '茨城', album: true, year: 2026 },
  { id: 147, date: '12/29', month: 12, event: '焼肉無双', payer: 'ゆうへい', amount: 14330, participants: ['ゆうへい', 'おかじ', 'けいすけ'], place: '埼玉', album: true, year: 2026 },
  { id: 148, date: '12/30', month: 12, event: '干支屋', payer: 'ゆうへい', amount: 66541, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'けいすけ'], place: '学芸大学', album: true, year: 2026 },
  { id: 149, date: '1/9', month: 1, event: 'Sunny Side Raincolor', payer: 'ゆうき', amount: 20020, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '学芸大学', album: true, year: 2026 },
  { id: 150, date: '1/11', month: 1, event: '3 Music', payer: 'ゆうき', amount: 21000, participants: ['ゆうき', 'けいすけ'], place: '恵比寿', album: true, year: 2026 },
  { id: 151, date: '1/11', month: 1, event: 'Play Back', payer: 'けいすけ', amount: 19200, participants: ['ゆうき', 'けいすけ'], place: '自由が丘', album: true, year: 2026 },
  { id: 152, date: '1/11', month: 1, event: '会心の一撃', payer: 'けいすけ', amount: 44000, participants: ['ゆうき', 'けいすけ'], place: '恵比寿', album: true, year: 2026 },
  { id: 153, date: '1/17', month: 1, event: 'くいものや楽', payer: 'ゆうへい', amount: 13470, participants: ['ゆうへい', 'けいすけ'], place: '経堂', album: true, year: 2026 },
  { id: 154, date: '2/7', month: 2, event: 'いろは寿司', payer: 'ゆうき', amount: 23903, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '中目黒', album: true, year: 2026 },
  { id: 155, date: '2/7', month: 2, event: 'Wines & things', payer: 'ゆうき', amount: 17230, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや'], place: '中目黒', album: true, year: 2026 },
  { id: 156, date: '2/7', month: 2, event: 'INC', payer: 'ゆうへい', amount: 22902, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '渋谷', album: true, year: 2026 },
  { id: 157, date: '2/7', month: 2, event: '会心の一撃', payer: 'おかじ', amount: 59200, participants: ['ゆうき', 'ゆうへい', 'おかじ', 'もりや', 'けいすけ'], place: '恵比寿', album: true, year: 2026 },
  { id: 158, date: '2/15', month: 2, event: '翻車魚丸', payer: 'ゆうき', amount: 11200, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '藤沢', album: true, year: 2026 },
  { id: 159, date: '2/15', month: 2, event: 'YOINE.', payer: 'ゆうへい', amount: 44000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '池尻', album: true, year: 2026 },
  { id: 160, date: '2/15', month: 2, event: 'Peace', payer: 'ゆうき', amount: 20000, participants: ['ゆうき', 'ゆうへい', 'けいすけ'], place: '学芸大学', album: true, year: 2026 },
  { id: 161, date: '2/22', month: 2, event: 'E.O.M.', payer: 'ゆうへい', amount: 55660, participants: ['ゆうき', 'ゆうへい'], place: '広尾', album: true, year: 2026 },
]

// ============================================================
// 割り勘データ（50件）
// ============================================================
type WarikanSeed = {
  id: number
  event: string
  status: string
  detailDeadline: string
  paymentDeadline: string
  memo: string
  manager: string
  year: number
  walicaUrl?: string
}

const WARIKAN_DATA: WarikanSeed[] = [
  { id: 1, event: 'まりなHBD', status: 'クローズ', detailDeadline: '-', paymentDeadline: '7/5', memo: '2024/3/23にゆうき邸でやったやつ', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01HSKKEKMVY25XK6FQZ7YP2QGJ' },
  { id: 2, event: 'thebotchおきなわ', status: 'クローズ', detailDeadline: '-', paymentDeadline: '7/5', memo: '2024/5/10-13の沖縄旅行', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01HXKMBX0GW65812893NK0MZDN' },
  { id: 3, event: '日曜ちる', status: 'クローズ', detailDeadline: '-', paymentDeadline: '7/5', memo: '6/2に5人で葉山の海に行ったやつ', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01HZC862CDKMNFRTPQ36JWGSTC' },
  { id: 4, event: '20240608 & 0616 & 0630_ピクニック', status: 'クローズ', detailDeadline: '7/3', paymentDeadline: '7/5', memo: '6月のピクニックまとめ', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01HZWC10GXRVZ32VD2QCK2KXQE' },
  { id: 5, event: '20240802\u201305_Guam', status: 'クローズ', detailDeadline: '8/18', paymentDeadline: '8/25', memo: '8月のGuam', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01HSK80TYTB28ZN5MF62CXS3NR' },
  { id: 6, event: '20240420-21 RDC', status: 'クローズ', detailDeadline: '-', paymentDeadline: '-', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01HJ61BFJSNQDZMZMTF4PX421R' },
  { id: 7, event: '20240705_ざぼっち_TENNIS', status: 'クローズ', detailDeadline: '7/8', paymentDeadline: '7/11', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J1Z7J7QAM8VFRAXRHXWJK5FS' },
  { id: 8, event: '20240715_トランポリンリン♪', status: 'クローズ', detailDeadline: '7/18', paymentDeadline: '7/21', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J280N9NR56P1F7W8ZWHGMQXH' },
  { id: 9, event: '20240720_テニス_ざぼっち', status: 'クローズ', detailDeadline: '7/22', paymentDeadline: '7/28', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J36QDFTFREG1BRM5FTP8JRFY' },
  { id: 10, event: '20240727_ゴーカート_ざぼっち', status: 'クローズ', detailDeadline: '7/29', paymentDeadline: '7/31', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J3MTZFBM236EKGXA29T4QEDQ' },
  { id: 11, event: '20240810_てにす', status: 'クローズ', detailDeadline: '8/12', paymentDeadline: '8/19', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J4VQY0RT9J6TS2QMNH1PNQBJ' },
  { id: 12, event: '20240817_納会mtg', status: 'クローズ', detailDeadline: '8/19', paymentDeadline: '8/26', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J5FHYSC4J23G18F42ZR3FBY8' },
  { id: 13, event: '20240825_テニス', status: 'クローズ', detailDeadline: '8/27', paymentDeadline: '9/3', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J6456XQPE9TM93NTET67WRG9' },
  { id: 14, event: '20240827_プール', status: 'クローズ', detailDeadline: '8/27', paymentDeadline: '9/5', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J66A4J3695VWEKG8X11Y4MV1' },
  { id: 15, event: '20240831_テニス', status: 'クローズ', detailDeadline: '8/31', paymentDeadline: '9/9', memo: '', manager: 'ー', year: 2024, walicaUrl: 'https://walica.jp/group/01J668B2Y7FSR175TH903BQXVN' },
  { id: 16, event: '20240907_韓国', status: 'クローズ', detailDeadline: '9/9', paymentDeadline: '10/23', memo: '', manager: 'ゆうき', year: 2024, walicaUrl: 'https://walica.jp/group/01J73JBB592YXZZDVHNRZR8YCT' },
  { id: 17, event: '20240907_韓国(マイル)', status: 'クローズ', detailDeadline: '9/9', paymentDeadline: '10/23', memo: 'マイル移行申請は実施済みだが実際に移行されるまで1wかかる', manager: 'ゆうき', year: 2024, walicaUrl: 'https://walica.jp/group/01J7B245KR97KQN8KVMCD4DBQR' },
  { id: 18, event: '20241005_テニス', status: 'クローズ', detailDeadline: '10/7', paymentDeadline: '10/23', memo: '', manager: 'ゆうき', year: 2024, walicaUrl: 'https://walica.jp/group/01J9D24RTT33MYG8K9E28GRAF6' },
  { id: 19, event: '20241014_テニス', status: 'クローズ', detailDeadline: '10/16', paymentDeadline: '10/23', memo: '', manager: 'ゆうき', year: 2024, walicaUrl: 'https://walica.jp/group/01JA4NYRBF0GSR10X9S4KSZYRK' },
  { id: 20, event: '20241029_HB', status: 'クローズ', detailDeadline: '10/31', paymentDeadline: '11/7', memo: '', manager: 'おかじ', year: 2024, walicaUrl: 'https://walica.jp/group/01JB5TPYRSAES8JF36CSR38EX1' },
  { id: 21, event: '20241109_テニス', status: 'クローズ', detailDeadline: '11/12', paymentDeadline: '11/15', memo: '', manager: 'もりや', year: 2024, walicaUrl: 'https://walica.jp/group/01JC7E0XBF71X3V6PN0PKGRXPF' },
  { id: 22, event: '20241221_テニス', status: 'クローズ', detailDeadline: '12/24', paymentDeadline: '12/31', memo: '', manager: 'おかじ', year: 2024, walicaUrl: 'https://walica.jp/group/01JFK9VH6N9TXXBXYFD29H91TV' },
  { id: 23, event: '20250103 テニス', status: 'クローズ', detailDeadline: '1/6', paymentDeadline: '1/13', memo: '', manager: 'おかじ', year: 2025, walicaUrl: 'https://walica.jp/group/01JGMXDSPT76Y86A5ET15R7D3F' },
  { id: 24, event: '20250112_FY25キックオフ', status: 'クローズ', detailDeadline: '1/15', paymentDeadline: '1/22', memo: '', manager: 'たからい', year: 2025, walicaUrl: 'https://walica.jp/group/01JHCCA2GDTV9PK5JF9EYFE2RM' },
  { id: 25, event: '20250113_テニス大蔵', status: 'クローズ', detailDeadline: '1/16', paymentDeadline: '1/23', memo: '', manager: 'ゆうき', year: 2025, walicaUrl: 'https://walica.jp/group/01JHEYHK40REBEKR9JS3C3812D' },
  { id: 26, event: '20250125_テニス川口', status: 'クローズ', detailDeadline: '1/28', paymentDeadline: '2/4', memo: '', manager: 'けいすけ', year: 2025, walicaUrl: 'https://walica.jp/group/01JJ47R0TC6Y7Z1BN5QVV42EDQ' },
  { id: 27, event: '20250208_テニス', status: 'クローズ', detailDeadline: '2/11', paymentDeadline: '2/18', memo: '', manager: 'おかじ', year: 2025, walicaUrl: 'https://walica.jp/group/01JKHQR22HZQ3HW73EK8591VXS' },
  { id: 28, event: '20250215-16スパルタン&テニス', status: 'クローズ', detailDeadline: '2/18', paymentDeadline: '2/25', memo: '', manager: 'ゆうき', year: 2025, walicaUrl: 'https://walica.jp/group/01JKXDWMC8RHKTR27G8MB6AQ97' },
  { id: 29, event: '20250418_RDC', status: 'クローズ', detailDeadline: '4/21', paymentDeadline: '4/28', memo: '', manager: 'ゆうき', year: 2025, walicaUrl: 'https://walica.jp/group/01JMZPPTXR0PTHVF00EB2A5813' },
  { id: 30, event: '20250309 テニス対抗戦', status: 'クローズ', detailDeadline: '3/12', paymentDeadline: '3/19', memo: '', manager: 'けいすけ', year: 2025, walicaUrl: 'https://walica.jp/group/01JNX6H5RW8SNYEXABP10JHKW5' },
  { id: 31, event: '20250320_テニス練習', status: 'クローズ', detailDeadline: '3/23', paymentDeadline: '3/30', memo: '', manager: 'たからい', year: 2025, walicaUrl: 'https://walica.jp/group/01JQGFMCN5BZR97NN1Q36GA4PM' },
  { id: 32, event: '20250412_花見ゆきちゃんHBD', status: 'クローズ', detailDeadline: '4/15', paymentDeadline: '4/22', memo: '', manager: 'もりや', year: 2025, walicaUrl: 'https://walica.jp/group/01JRJTCNBKFQT062FM21W3RZ9V' },
  { id: 33, event: '20250329 試合できなかった', status: 'クローズ', detailDeadline: '4/1', paymentDeadline: '4/8', memo: '', manager: 'たからい', year: 2025, walicaUrl: 'https://walica.jp/group/01JQGFMCN5BZR97NN1Q36GA4PM' },
  { id: 34, event: '20250531_石和', status: 'クローズ', detailDeadline: '6/3', paymentDeadline: '6/10', memo: '', manager: 'けいすけ', year: 2025, walicaUrl: 'https://walica.jp/group/01JV71FRNY1TGFWS84TZN1TCF9' },
  { id: 35, event: '20250607_テニテニ', status: 'クローズ', detailDeadline: '6/10', paymentDeadline: '6/17', memo: '', manager: 'けいすけ', year: 2025, walicaUrl: 'https://walica.jp/group/01JX59GCNXN78GEV8BD42GZZ44' },
  { id: 36, event: '20250628_カート', status: 'クローズ', detailDeadline: '7/1', paymentDeadline: '7/8', memo: '', manager: 'おかじ', year: 2025, walicaUrl: 'https://walica.jp/group/01JYT41K76NDBRJ2KM2Y2DCNK5' },
  { id: 37, event: '20250713_テニス', status: 'クローズ', detailDeadline: '7/16', paymentDeadline: '7/23', memo: '', manager: 'ゆうき', year: 2025, walicaUrl: 'https://walica.jp/group/01K01QYM1DYQDCJX1FPPGABHFR' },
  { id: 38, event: '20250719_テニス団体戦', status: 'クローズ', detailDeadline: '7/22', paymentDeadline: '7/29', memo: '', manager: 'たからい', year: 2025, walicaUrl: 'https://walica.jp/group/01K0EF8PQ5RSQJ4N5TFDVJ208E' },
  { id: 39, event: '20250721_テニス', status: 'クローズ', detailDeadline: '7/24', paymentDeadline: '7/31', memo: '', manager: 'もりや', year: 2025, walicaUrl: 'https://walica.jp/group/01K0NHQ3CFWQT72XZS0G1QGP3C' },
  { id: 40, event: '20250906_みんなで初めてゴルフで遊んだ日', status: 'クローズ', detailDeadline: '9/9', paymentDeadline: '9/16', memo: '', manager: 'けいすけ', year: 2025, walicaUrl: 'https://walica.jp/group/01K4B2TYHMWNBM3TWVFXBE8NY3' },
  { id: 41, event: '20250920_ゴルフ＆テニス', status: 'クローズ', detailDeadline: '9/23', paymentDeadline: '9/30', memo: '', manager: 'ゆうへい', year: 2025, walicaUrl: 'https://walica.jp/group/01K5G34BY288GXK09NG4JVEH6F' },
  { id: 42, event: '20250928_旅行作戦会議＆テニス', status: 'クローズ', detailDeadline: '10/1', paymentDeadline: '10/8', memo: '', manager: 'たからい', year: 2025, walicaUrl: 'https://walica.jp/group/01K6727SSA72VZ9WJB7YGFHXAN' },
  { id: 43, event: '20251011_イタリアン飯＆テニス', status: 'クローズ', detailDeadline: '10/14', paymentDeadline: '10/21', memo: 'けいすけtoおかじにイタリアン代払い待ち', manager: 'もりや', year: 2025, walicaUrl: 'https://walica.jp/group/01K79S034N0R10Q2HES4TZGWFH' },
  { id: 44, event: '20251025-26 熱海旅行', status: 'クローズ', detailDeadline: '10/28', paymentDeadline: '11/4', memo: '', manager: 'おかじ', year: 2025, walicaUrl: 'https://walica.jp/group/01K84R2G45PTCVT5M3S10WGMTE' },
  { id: 45, event: '20251108_テニス', status: 'クローズ', detailDeadline: '11/11', paymentDeadline: '11/18', memo: '', manager: 'もりや', year: 2025, walicaUrl: 'https://walica.jp/group/01K9MCPJPETPKK3BCZW0FJA2TC' },
  { id: 46, event: '20251230_大﨑家合宿', status: 'クローズ', detailDeadline: '1/2', paymentDeadline: '1/9', memo: '', manager: 'ゆうへい', year: 2025, walicaUrl: 'https://walica.jp/group/01KDHK2BX7APKJW6FHS46SB0D1' },
  { id: 47, event: '20260104マダミスと20260110埼玉遠征', status: 'クローズ', detailDeadline: '1/7', paymentDeadline: '1/14', memo: '', manager: 'ゆうへい', year: 2026, walicaUrl: 'https://walica.jp/group/01KE3XCGBHZT41TYD2QNXG0WR0' },
  { id: 48, event: '20260110_富士クラシック', status: 'クローズ', detailDeadline: '1/13', paymentDeadline: '1/20', memo: '', manager: 'ゆうへい', year: 2026, walicaUrl: 'https://walica.jp/group/01KEJAYSBBS1G1ETSSB8R7X6GZ' },
  { id: 49, event: '20260207_テニス', status: 'クローズ', detailDeadline: '2/10', paymentDeadline: '2/17', memo: '', manager: 'ゆうへい', year: 2026, walicaUrl: 'https://walica.jp/group/01KGVMDQJ2HH5YH4NZ4H45H1R0' },
  { id: 50, event: '20260301_テニス練習', status: '支払待ち', detailDeadline: '3/4', paymentDeadline: '3/10', memo: '', manager: 'もりや', year: 2026 },
]

// ============================================================
// ユーティリティ
// ============================================================

/**
 * 漢気データの日付を実際のカレンダー日付に変換する。
 * 年度（fiscal year）ルール:
 *   - 月 >= 11（Nov, Dec）→ カレンダー年 = fiscalYear - 1
 *   - 月 1-10            → カレンダー年 = fiscalYear
 */
function toEventDate(dateStr: string, month: number, fiscalYear: number): Date {
  const [m, d] = dateStr.split('/').map(Number)
  const calendarYear = month >= 11 ? fiscalYear - 1 : fiscalYear
  return new Date(calendarYear, m - 1, d)
}

/**
 * 割り勘の期限文字列を Date に変換する。
 * '-' の場合は null を返す。
 */
function toDeadlineDate(deadlineStr: string, year: number): Date | null {
  if (deadlineStr === '-') return null
  const [m, d] = deadlineStr.split('/').map(Number)
  // 割り勘の期限は年フィールドをそのまま使用（割り勘は年度ロジック不要）
  return new Date(year, m - 1, d)
}

/**
 * 割り勘ステータスのマッピング
 */
function toWarikanStatus(status: string): WarikanStatus {
  switch (status) {
    case 'クローズ': return WarikanStatus.CLOSED
    case '支払待ち': return WarikanStatus.PAYING
    case '明細追加待ち': return WarikanStatus.ENTERING
    default: throw new Error(`不明なステータス: ${status}`)
  }
}

/**
 * 漢気イベント用の決定論的UUID生成（id 1-161）
 */
function otokogiUuid(id: number): string {
  return `10000000-0000-4000-a000-${String(id).padStart(12, '0')}`
}

/**
 * 割り勘イベント用の決定論的UUID生成（id 1-50）
 */
function warikanUuid(id: number): string {
  return `20000000-0000-4000-a000-${String(id).padStart(12, '0')}`
}

// ============================================================
// メイン処理
// ============================================================
async function main(): Promise<void> {
  console.log('シード開始...')

  await prisma.$transaction(async (tx) => {
    // 1. 既存データを逆依存順に全削除
    console.log('既存データを削除中...')
    await tx.warikanSettlement.deleteMany()
    await tx.warikanExpense.deleteMany()
    await tx.warikanParticipant.deleteMany()
    await tx.warikanEvent.deleteMany()
    await tx.otokogiParticipant.deleteMany()
    await tx.otokogiEvent.deleteMany()
    await tx.member.deleteMany()
    console.log('  既存データ削除完了')

    // 2. メンバー作成（固定UUID）
    console.log('メンバーを作成中...')
    for (const m of MEMBERS) {
      await tx.member.create({
        data: {
          id: MEMBER_IDS[m.name],
          name: m.name,
          fullName: m.fullName,
          initial: m.initial,
          colorBg: m.colorBg,
          colorText: m.colorText,
          paypayId: m.paypayId,
        },
      })
      console.log(`  メンバー: ${m.name} (${MEMBER_IDS[m.name]})`)
    }

    // 3. 漢気イベント作成（161件）
    console.log('漢気イベントを作成中...')
    for (const o of OTOKOGI_DATA) {
      const payerId = MEMBER_IDS[o.payer]
      const eventDate = toEventDate(o.date, o.month, o.year)

      await tx.otokogiEvent.create({
        data: {
          id: otokogiUuid(o.id),
          eventDate,
          eventName: o.event,
          payerId,
          amount: o.amount,
          place: o.place,
          hasAlbum: o.album,
          participants: {
            create: o.participants.map((name) => ({
              memberId: MEMBER_IDS[name],
            })),
          },
        },
      })

      if (o.id % 20 === 0) console.log(`  漢気イベント: ${o.id}/161`)
    }
    console.log('  漢気イベント: 161/161 完了')

    // 4. 割り勘イベント作成（50件）+ 全メンバーを参加者として追加
    console.log('割り勘イベントを作成中...')
    const allMemberIds = Object.values(MEMBER_IDS)

    for (const w of WARIKAN_DATA) {
      const managerId = w.manager !== 'ー'
        ? MEMBER_IDS[w.manager as MemberName] ?? null
        : null
      if (w.manager !== 'ー' && !managerId) {
        throw new Error(`不明な管理者: ${w.manager} (warikan id: ${w.id})`)
      }

      const detailDeadline = toDeadlineDate(w.detailDeadline, w.year)
      const paymentDeadline = toDeadlineDate(w.paymentDeadline, w.year)
      const status = toWarikanStatus(w.status)

      await tx.warikanEvent.create({
        data: {
          id: warikanUuid(w.id),
          eventName: w.event,
          status,
          detailDeadline,
          paymentDeadline,
          memo: w.memo || null,
          managerId,
          walicaUrl: w.walicaUrl ?? null,
          participants: {
            create: allMemberIds.map((memberId) => ({
              memberId,
            })),
          },
        },
      })

      if (w.id % 10 === 0) console.log(`  割り勘イベント: ${w.id}/50`)
    }
    console.log('  割り勘イベント: 50/50 完了')
  }, {
    // トランザクションタイムアウトを長めに設定（大量データのため）
    timeout: 60000,
  })

  console.log('シード完了')
}

main()
  .catch((e: Error) => {
    console.error('シードエラー:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
