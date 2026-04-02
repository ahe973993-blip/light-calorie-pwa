# Dify 工作流搭建手册（AI 营养师）

## 1. 工作流类型
- App 类型：`Workflow`
- 目标：根据三餐图片 + 食物克重 + 身体信息，输出固定格式减脂日报。

## 2. 节点总览
- `N0 Start_用户输入`
- `N1 输入校验与解析 (Code)`
- `C1 参数是否有效 (If/Else)`
- `N1E 参数错误输出 (Template)`
- `N2A 早餐图片识别 (LLM Vision)`
- `N2B 午餐图片识别 (LLM Vision)`
- `N2C 晚餐图片识别 (LLM Vision)`
- `N3 食物合并标准化 (Code)`
- `N4 热量计算 (Code)`
- `N5 BMR_TDEE 计算 (Code)`
- `N6 热量对比 (Code)`
- `N7 建议生成 (Code)`
- `N8 严格格式化输出 (Template)`
- `End`

## 3. Start 节点输入字段
在 `N0 Start_用户输入` 配置以下字段（变量名必须一致）：

1. `height_cm`（Number，必填）
2. `weight_kg`（Number，必填）
3. `age`（Number，必填）
4. `gender`（Select，必填）
   - 选项：`男`、`女`
5. `activity_level`（Select，必填）
   - 选项建议：
   - `久坐`
   - `轻量活动`
   - `中等活动`
   - `高强度活动`
   - `极高活动`
6. `breakfast_image`（File，图片，必填）
7. `lunch_image`（File，图片，必填）
8. `dinner_image`（File，图片，必填）
9. `breakfast_items`（Paragraph，必填）
10. `lunch_items`（Paragraph，必填）
11. `dinner_items`（Paragraph，必填）

文本示例（提示文案可写在 Placeholder）：
- `鸡蛋100g, 牛奶250g`
- `米饭200g；鸡胸肉150g；西兰花100g`

## 4. 节点详细配置

### N1 输入校验与解析（Code）
- 输入变量映射：
  - `height_cm <- N0.height_cm`
  - `weight_kg <- N0.weight_kg`
  - `age <- N0.age`
  - `gender <- N0.gender`
  - `activity_level <- N0.activity_level`
  - `breakfast_items <- N0.breakfast_items`
  - `lunch_items <- N0.lunch_items`
  - `dinner_items <- N0.dinner_items`
- 代码：复制 `code_nodes/N1_validate_parse.py`
- 输出关键字段：
  - `valid`
  - `error_msg`
  - `height_cm`, `weight_kg`, `age`, `gender_cn`, `gender_en`, `activity_factor`
  - `breakfast_user_items`, `lunch_user_items`, `dinner_user_items`

### C1 参数是否有效（If/Else）
- 条件：`N1.valid == true`
- True 分支：进入图片识别
- False 分支：进入 `N1E`

### N1E 参数错误输出（Template）
模板内容：

```text
【基础信息】
身高：{{N0.height_cm}}
体重：{{N0.weight_kg}}
年龄：{{N0.age}}
性别：{{N0.gender}}
每日所需热量（TDEE）：无法计算

【今日饮食记录】
早餐：{{N0.breakfast_items}}
午餐：{{N0.lunch_items}}
晚餐：{{N0.dinner_items}}
今日总摄入：无法计算

【热量对比】
摄入 vs 所需：无法计算
差额：无法计算
结论：输入信息不完整或格式错误

【建议】
请先修正输入：{{N1.error_msg}}
```

### N2A/N2B/N2C 图片识别（LLM Vision）
- 三个节点配置一致，只是图片变量不同。
- 模型：选择你在 Dify 可用的视觉模型（如 GPT-4.1 / Gemini Vision）。
- Temperature：`0.1`
- System Prompt：

```text
你是食物识别器。任务是识别图片中的主要食物名称。
输出要求：
1) 只输出 JSON，不要任何解释。
2) 严格格式：{"foods":["食物1","食物2"]}
3) 不要估算重量，不要输出热量。
4) 无法确认时可给简短可能项，但保持 foods 列表简洁。
```

- User Prompt：

```text
请识别这张餐食图片中的食物名称，按要求返回 JSON。
```

- 文件输入绑定：
  - `N2A` 绑定 `N0.breakfast_image`
  - `N2B` 绑定 `N0.lunch_image`
  - `N2C` 绑定 `N0.dinner_image`

### N3 食物合并标准化（Code）
- 输入变量映射：
  - `breakfast_user_items <- N1.breakfast_user_items`
  - `lunch_user_items <- N1.lunch_user_items`
  - `dinner_user_items <- N1.dinner_user_items`
  - `breakfast_vision_text <- N2A.text`
  - `lunch_vision_text <- N2B.text`
  - `dinner_vision_text <- N2C.text`
- 代码：复制 `code_nodes/N3_merge_items.py`
- 输出字段：
  - `breakfast_final_items`
  - `lunch_final_items`
  - `dinner_final_items`

### N4 热量计算（Code）
- 输入变量映射：
  - `breakfast_final_items <- N3.breakfast_final_items`
  - `lunch_final_items <- N3.lunch_final_items`
  - `dinner_final_items <- N3.dinner_final_items`
- 代码：复制 `code_nodes/N4_calorie_calc.py`
- 输出字段：
  - `breakfast_summary`, `lunch_summary`, `dinner_summary`
  - `breakfast_kcal`, `lunch_kcal`, `dinner_kcal`
  - `intake_total`

### N5 BMR_TDEE 计算（Code）
- 输入变量映射：
  - `height_cm <- N1.height_cm`
  - `weight_kg <- N1.weight_kg`
  - `age <- N1.age`
  - `gender_en <- N1.gender_en`
  - `activity_factor <- N1.activity_factor`
- 代码：复制 `code_nodes/N5_bmr_tdee.py`
- 输出字段：
  - `bmr`
  - `tdee`

### N6 热量对比（Code）
- 输入变量映射：
  - `intake_total <- N4.intake_total`
  - `tdee <- N5.tdee`
- 代码：复制 `code_nodes/N6_compare.py`
- 输出字段：
  - `intake_vs_need`
  - `delta`
  - `delta_text`
  - `conclusion`

### N7 建议生成（Code）
- 输入变量映射：
  - `delta <- N6.delta`
- 代码：复制 `code_nodes/N7_advice.py`
- 输出字段：
  - `advice`

### N8 严格格式化输出（Template）
模板内容：

```text
【基础信息】
身高：{{N1.height_cm}} cm
体重：{{N1.weight_kg}} kg
年龄：{{N1.age}}
性别：{{N1.gender_cn}}
每日所需热量（TDEE）：{{N5.tdee}} kcal

【今日饮食记录】
早餐：{{N4.breakfast_summary}}
午餐：{{N4.lunch_summary}}
晚餐：{{N4.dinner_summary}}
今日总摄入：{{N4.intake_total}} kcal

【热量对比】
摄入 vs 所需：{{N6.intake_vs_need}}
差额：{{N6.delta_text}}
结论：{{N6.conclusion}}

【建议】
{{N7.advice}}
```

## 5. 连接关系
按下面关系拉线：

1. `N0 -> N1 -> C1`
2. `C1(false) -> N1E -> End`
3. `C1(true) -> N2A`
4. `C1(true) -> N2B`
5. `C1(true) -> N2C`
6. `N2A -> N3`
7. `N2B -> N3`
8. `N2C -> N3`
9. `N1 -> N3`
10. `N3 -> N4`
11. `N1 -> N5`
12. `N4 -> N6`
13. `N5 -> N6`
14. `N6 -> N7`
15. `N1 -> N8`
16. `N4 -> N8`
17. `N5 -> N8`
18. `N6 -> N8`
19. `N7 -> N8`
20. `N8 -> End`

## 6. 验证用例
可用以下输入做冒烟测试：

- 身高：`175`
- 体重：`72`
- 年龄：`29`
- 性别：`男`
- 活动水平：`中等活动`
- 早餐：`鸡蛋100g, 牛奶250g, 面包60g`
- 午餐：`米饭200g, 鸡胸肉150g, 西兰花120g`
- 晚餐：`米饭120g, 鱼肉180g, 菠菜150g`

预期：
- 能输出固定 4 段格式。
- 今日总摄入、TDEE、差额、结论均为数值化结果。
- 建议为简短可执行内容，无医疗诊断。

## 7. 你可选的增强项（下一步）
1. 把 `CALORIE_PER_100G` 接到外部食物数据库或知识库。
2. 在 N4 输出里增加“未知食物估算数量”用于质量监控。
3. 增加连续多日记录（写入 Dataset 或外部表）生成周报。
