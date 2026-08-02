import json
import os
import time

# ===================== 工程文件路径配置 (固定lib目录) =====================
BASE_DIR = os.path.join(os.path.dirname(__file__), "resources")
TRANS_FILE_PATH = os.path.join(BASE_DIR, "translation_cn.json")
MARKET_FILE_PATH = os.path.join(BASE_DIR, "marketData.json")
EQUIP_PLAN_FILE_PATH = os.path.join(BASE_DIR, "equipmentPlan.json")

# ===================== 全局内存缓存 (只加载一次，杜绝重复读文件，核心优化) =====================
name_2_item_id = {}  # 物品名称 -> 物品ID 映射
item_id_2_price = {}  # 物品ID -> 各强化等级价格数据 映射
equip_plan_all = {}  # 所有配装方案原始数据
market_timestamp = 0  # 市场数据的Unix时间戳
data_loaded = False  # 数据加载标记，确保只执行一次加载


# ===================== 初始化：一次性加载所有JSON数据到内存 =====================
def load_all_json_data():
    """全局初始化函数：仅执行1次，加载3个JSON文件数据到内存缓存"""
    global name_2_item_id, item_id_2_price, equip_plan_all, market_timestamp, data_loaded
    if data_loaded:
        return

    # 1. 加载 物品名称<->物品ID 翻译文件
    try:
        with open(TRANS_FILE_PATH, 'r', encoding='utf-8') as f:
            trans_data = json.load(f)
            item_names = trans_data.get("itemNames", {})
            name_2_item_id = {v: k for k, v in item_names.items()}
    except Exception as e:
        print(f"【警告】加载翻译文件失败: {str(e)}")

    # 2. 加载 物品市场价格+时间戳 文件
    try:
        with open(MARKET_FILE_PATH, 'r', encoding='utf-8') as f:
            market_data = json.load(f)
            item_id_2_price = market_data.get("marketData", {})
            market_timestamp = market_data.get("timestamp", 0)
    except Exception as e:
        print(f"【警告】加载市场价格文件失败: {str(e)}")

    # 3. 加载 配装方案 文件 (本次格式更新重点)
    try:
        with open(EQUIP_PLAN_FILE_PATH, 'r', encoding='utf-8') as f:
            equip_plan_all = json.load(f)
    except Exception as e:
        print(f"【警告】加载配装方案文件失败: {str(e)}")

    data_loaded = True


# ===================== 核心工具函数 =====================
def get_str_actual_width(s: str) -> int:
    """计算字符串真实显示宽度：中文/中文符号占2位，英文/数字/符号占1位"""
    width = 0
    for char in str(s):
        width += 2 if '\u4e00' <= char <= '\u9fff' else 1
    return width


def text_align(text, target_width: int, align: str = "left") -> str:
    """按真实宽度对齐文本，彻底解决中文排版错位问题，核心对齐方法"""
    text_str = str(text)
    actual_width = get_str_actual_width(text_str)
    pad_width = max(0, target_width - actual_width)
    if align == "left":
        return text_str + " " * pad_width
    elif align == "right":
        return " " * pad_width + text_str
    return text_str


def format_price_num(price: int) -> str:
    """价格格式化：严格遵循 1M=1000K=1000*1000，无数据(-1)显示'-'"""
    if price == -1:
        return "-"
    if price >= 1000 * 1000:
        return f"{price / 1000000:.1f}M"
    elif price >= 1000:
        return f"{price // 1000}K"
    else:
        return str(price)


def parse_equipment_name(equip_name: str) -> tuple[str, int]:
    """解析装备名称，兼容2种格式：
    - 格式1: 物品名称+强化等级 如 混沌连枷+7 → (混沌连枷,7)
    - 格式2: 纯物品名称 如 金币 → (金币,0)
    """
    if "+" in equip_name and equip_name.rsplit("+", 1)[-1].isdigit():
        pure_name, level = equip_name.rsplit("+", 1)
        return pure_name.strip(), int(level)
    return equip_name.strip(), 0


def get_equip_sell_buy_price(item_name: str, enhance_level: int) -> tuple[int, int]:
    """根据【物品名称+强化等级】获取 出售价(a) 和 收购价(b)，无数据返回 (-1,-1)"""
    item_id = name_2_item_id.get(item_name, "")
    if not item_id:
        return -1, -1
    # 强化等级是字符串key(0/1/7/10)，精准匹配
    level_price = item_id_2_price.get(item_id, {}).get(str(enhance_level), {})
    sell_price = level_price.get("a", -1)
    buy_price = level_price.get("b", -1)
    return sell_price, buy_price


# ===================== 核心表格打印主函数 =====================
def print_equipment_plan_price_table():
    """主执行函数：打印格式化对齐的配装价格表，含合计行+过滤disable方案"""
    load_all_json_data()

    # 表格列宽配置（按真实宽度定义，可按需调整）
    COL_PLAN = 26  # 配装方案列宽
    COL_EQUIP = 22  # 装备名称列宽
    COL_SELL = 14  # 出售价列宽
    COL_BUY = 14  # 收购价列宽
    total_line_width = COL_PLAN + COL_EQUIP + COL_SELL + COL_BUY

    # 表头：打印Unix时间戳 + 格式化本地时间
    local_datetime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(market_timestamp))
    print("=" * total_line_width)
    print(f"📊 配装方案价格明细表 | 市场数据时间: {market_timestamp} | {local_datetime}")
    print("=" * total_line_width)
    # 打印表头字段
    print(
        f"{text_align('配装方案', COL_PLAN)}{text_align('装备名称', COL_EQUIP)}{text_align('出售价', COL_SELL, 'right')}{text_align('收购价', COL_BUY, 'right')}")
    print("-" * total_line_width)

    # 遍历所有配装方案，过滤 enable=False 的方案
    for plan_name, plan_info in equip_plan_all.items():
        # 核心过滤：enable为false 直接跳过该方案
        if not plan_info.get("enable", False):
            continue
        equip_list = plan_info.get("plan", [])
        if not equip_list:
            continue

        # 初始化方案合计金额
        total_sell_price = 0
        total_buy_price = 0
        is_first_line = True  # 控制配装方案名称只在第一行显示

        # 遍历方案下的每一个装备
        for equip_name in equip_list:
            pure_name, enhance_lv = parse_equipment_name(equip_name)
            sell_p, buy_p = get_equip_sell_buy_price(pure_name, enhance_lv)

            # 有效价格才累加合计 (排除-1的无效值)
            if sell_p != -1:
                total_sell_price += sell_p
            if buy_p != -1:
                total_buy_price += buy_p

            # 格式化显示内容
            show_plan_name = plan_name if is_first_line else ""
            show_sell = format_price_num(sell_p)
            show_buy = format_price_num(buy_p)

            # 打印单行数据
            print(
                f"{text_align(show_plan_name, COL_PLAN)}{text_align(equip_name, COL_EQUIP)}{text_align(show_sell, COL_SELL, 'right')}{text_align(show_buy, COL_BUY, 'right')}")
            is_first_line = False

        # 打印当前方案的合计行
        print(
            f"{text_align('【方案合计】', COL_PLAN)}{text_align('', COL_EQUIP)}{text_align(format_price_num(total_sell_price), COL_SELL, 'right')}{text_align(format_price_num(total_buy_price), COL_BUY, 'right')}")
        print("-" * total_line_width)

    print("=" * total_line_width)


# ===================== 程序执行入口 =====================
if __name__ == "__main__":
    print_equipment_plan_price_table()
