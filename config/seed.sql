-- LegalAI MVP - 种子数据
-- 包含 28 条法条 + 风险关键词 + 17 份模板
-- 通过 init.sql 创建表后执行

-- ============================================
-- 法条 seed（28 条核心民法典/劳动法/刑法条款）
-- ============================================
INSERT INTO legal_articles (code, article, category, content, keywords, jurisdiction, effective_date) VALUES
-- 合同纠纷（9 条）
('民法典', '第五百七十七条', 'contract', '当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。', ARRAY['违约责任','合同义务','继续履行','赔偿损失'], 'CN', '2021-01-01'),
('民法典', '第五百八十五条', 'contract', '当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金，也可以约定因违约产生的损失赔偿额的计算方法。', ARRAY['违约金','损失赔偿','计算方法'], 'CN', '2021-01-01'),
('民法典', '第五百八十六条', 'contract', '当事人可以约定一方向对方给付定金作为债权的担保。定金合同自实际交付定金时成立。定金的数额由当事人约定；但是，不得超过主合同标的额的百分之二十。', ARRAY['定金','债权担保','标的额','百分之二十'], 'CN', '2021-01-01'),
('民法典', '第五百七十九条', 'contract', '当事人一方未支付价款、报酬、租金、利息，或者不履行其他金钱债务的，对方可以请求其支付。', ARRAY['价款','报酬','租金','金钱债务'], 'CN', '2021-01-01'),
('民法典', '第四百六十四条', 'contract', '合同是民事主体之间设立、变更、终止民事法律关系的协议。', ARRAY['合同','民事主体','法律关系'], 'CN', '2021-01-01'),
('民法典', '第五百零二条', 'contract', '依法成立的合同，自成立时生效，但是法律另有规定或者当事人另有约定的除外。', ARRAY['合同生效','成立','约定'], 'CN', '2021-01-01'),
('民法典', '第五百六十二条', 'contract', '当事人协商一致，可以解除合同。当事人可以约定一方解除合同的事由。解除合同的事由发生时，解除权人可以解除合同。', ARRAY['解除合同','协商一致','解除权'], 'CN', '2021-01-01'),
('民法典', '第五百六十三条', 'contract', '有下列情形之一的，当事人可以解除合同：（一）因不可抗力致使不能实现合同目的；（二）在履行期限届满前，当事人一方明确表示或者以自己的行为表明不履行主要债务...', ARRAY['解除条件','不可抗力','履行期限','不履行'], 'CN', '2021-01-01'),
('民法典', '第五百七十八条', 'contract', '当事人一方依约履行义务的，应当按照约定的时间、方式、数量、质量等要求全面履行。', ARRAY['全面履行','质量','数量'], 'CN', '2021-01-01'),

-- 劳动合同（8 条）
('劳动合同法', '第三十九条', 'labor', '劳动者有下列情形之一的，用人单位可以解除劳动合同（过失性辞退）：在试用期间被证明不符合录用条件的；严重违反用人单位的规章制度的；严重失职，营私舞弊，给用人单位造成重大损害的...', ARRAY['过失性辞退','试用期','严重违纪','营私舞弊'], 'CN', '2008-01-01'),
('劳动合同法', '第四十条', 'labor', '有下列情形之一的，用人单位提前三十日以书面形式通知劳动者本人或者额外支付劳动者一个月工资后，可以解除劳动合同（非过失性辞退）。', ARRAY['非过失性辞退','医疗期','不能胜任','客观情况'], 'CN', '2008-01-01'),
('劳动合同法', '第四十七条', 'labor', '经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资的标准向劳动者支付。六个月以上不满一年的，按一年计算；不满六个月的，向劳动者支付半个月工资的经济补偿。', ARRAY['经济补偿','工作年限','月工资'], 'CN', '2008-01-01'),
('劳动合同法', '第八十七条', 'labor', '用人单位违反本法规定解除或者终止劳动合同的，应当依照经济补偿标准的二倍向劳动者支付赔偿金。', ARRAY['违法解除','赔偿金','二倍','2N'], 'CN', '2008-01-01'),
('劳动合同法', '第三十条', 'labor', '用人单位应当按照劳动合同约定和国家规定，向劳动者及时足额支付劳动报酬。用人单位拖欠或者未足额支付劳动报酬的，劳动者可以依法向人民法院申请支付令。', ARRAY['劳动报酬','足额支付','支付令'], 'CN', '2008-01-01'),
('劳动合同法', '第三十八条', 'labor', '用人单位有下列情形之一的，劳动者可以解除劳动合同：未按照劳动合同约定提供劳动保护或者劳动条件的；未及时足额支付劳动报酬的；未依法为劳动者缴纳社会保险费的...', ARRAY['劳动者解除','劳动保护','社保'], 'CN', '2008-01-01'),
('劳动合同法', '第十九条', 'labor', '劳动合同期限三个月以上不满一年的，试用期不得超过一个月；劳动合同期限一年以上不满三年的，试用期不得超过二个月；三年以上固定期限和无固定期限的劳动合同，试用期不得超过六个月。', ARRAY['试用期','劳动合同期限','六个月'], 'CN', '2008-01-01'),
('劳动合同法', '第八十二条', 'labor', '用人单位自用工之日起超过一个月不满一年未与劳动者订立书面劳动合同的，应当向劳动者每月支付二倍的工资。', ARRAY['书面合同','二倍工资','未签合同'], 'CN', '2008-01-01'),

-- 婚姻家庭（3 条）
('民法典', '第一千零七十六条', 'family', '夫妻双方自愿离婚的，应当签订书面离婚协议，并亲自到婚姻登记机关申请离婚登记。', ARRAY['协议离婚','离婚协议','婚姻登记'], 'CN', '2021-01-01'),
('民法典', '第一千零七十七条', 'family', '自婚姻登记机关收到离婚登记申请之日起三十日内，任何一方不愿意离婚的，可以向婚姻登记机关撤回离婚登记申请。', ARRAY['离婚冷静期','三十日','撤回申请'], 'CN', '2021-01-01'),
('民法典', '第一千零八十七条', 'family', '离婚时，夫妻的共同财产由双方协议处理；协议不成的，由人民法院根据财产的具体情况，按照照顾子女、女方和无过错方权益的原则判决。', ARRAY['共同财产','离婚','财产分割','照顾子女'], 'CN', '2021-01-01'),

-- 侵权/交通事故（3 条）
('民法典', '第一千一百七十九条', 'tort', '侵害他人造成人身损害的，应当赔偿医疗费、护理费、交通费、营养费、住院伙食补助费等为治疗和康复支出的合理费用，以及因误工减少的收入。造成残疾的，还应当赔偿辅助器具费和残疾赔偿金。', ARRAY['人身损害','医疗费','误工费','残疾赔偿金'], 'CN', '2021-01-01'),
('民法典', '第一千一百八十一条', 'tort', '被侵权人死亡的，其近亲属有权请求侵权人承担侵权责任。被侵权人为组织，该组织分立、合并的，承继权利的组织有权请求侵权人承担侵权责任。', ARRAY['被侵权人死亡','近亲属','侵权责任'], 'CN', '2021-01-01'),
('道路交通安全法', '第七十六条', 'tort', '机动车发生交通事故造成人身伤亡、财产损失的，由保险公司在机动车第三者责任强制保险责任限额范围内予以赔偿。', ARRAY['交通事故','交强险','责任限额'], 'CN', '2011-05-01'),

-- 借贷/继承（3 条）
('民法典', '第六百七十五条', 'finance', '借款人应当按照约定的期限返还借款。对借款期限没有约定或者约定不明确，依据本法第五百一十条的规定仍不能确定的，借款人可以随时返还；贷款人可以催告借款人在合理期限内返还。', ARRAY['返还借款','借款期限','合理期限'], 'CN', '2021-01-01'),
('民法典', '第六百八十条', 'finance', '禁止高利放贷，借款的利率不得违反国家有关规定。借款的利息不得预先在本金中扣除。利息预先在本金中扣除的，应当按照实际借款数额返还借款并计算利息。', ARRAY['高利放贷','利率','禁止'], 'CN', '2021-01-01'),
('民法典', '第一千一百二十三条', 'inheritance', '继承开始后，按照法定继承办理；有遗嘱的，按照遗嘱继承或者遗赠办理；有遗赠扶养协议的，按照协议办理。', ARRAY['继承','法定继承','遗嘱','遗赠'], 'CN', '2021-01-01'),

-- 知识产权 + 房产（2 条）
('著作权法', '第十条', 'property', '著作权包括下列人身权和财产权：发表权、署名权、修改权、保护作品完整权、复制权、发行权、信息网络传播权等。', ARRAY['著作权','人身权','财产权','信息网络传播权'], 'CN', '2020-11-11'),
('民法典', '第七百零三条', 'property', '租赁合同是出租人将租赁物交付承租人使用、收益，承租人支付租金的合同。', ARRAY['租赁合同','出租人','承租人','租金'], 'CN', '2021-01-01')
ON CONFLICT (code, article) DO NOTHING;

-- ============================================
-- 风险关键词 seed（合同/劳动 领域核心词）
-- ============================================
INSERT INTO risk_keywords (category, keyword, level, description, suggestion, domain) VALUES
-- 合同类 high
('contract', '最终解释权', 'high', '"最终解释权归XX所有"对消费者不公', '删去此条或改为"按法律法规及合同约定执行"', 'contract'),
('contract', '概不负责', 'high', '绝对免责条款可能被认定无效', '列举具体免责情形并保留法律规定的免责权', 'contract'),
('contract', '签字即生效', 'medium', '暗示消费者放弃其他权利', '明确合同生效条件', 'contract'),
('contract', '不予退还', 'high', '单方设定的不退条款可能无效', '按已履行情况区分退费比例', 'contract'),
('contract', '不设上限', 'high', '违约金或赔偿无上限，可能被法院调整', '约定合理上限（如实际损失的130%）', 'contract'),
('contract', '保密期限', 'medium', '约定不明的保密期可能导致争议', '明确保密起止时间，建议2-5年', 'contract'),
('contract', '知识产权归属', 'medium', '未约定可能产生纠纷', '明确约定职务作品归属', 'contract'),
('contract', '不可抗力', 'medium', '条款过宽或过严', '参照民法典第590条列举典型情形', 'contract'),
('contract', '争议管辖', 'medium', '约定不明增加诉讼成本', '明确约定具体法院或仲裁机构', 'contract'),
('contract', '单方解除', 'high', '单方解除权条款需平衡', '附条件行使并需提前书面通知', 'contract'),

-- 合同类 medium
('contract', '违约金', 'medium', '约定过高过低均可申请调整', '约定实际损失的130%以内', 'contract'),
('contract', '定金', 'medium', '超过20%部分不产生定金效力', '定金不超过合同标的额的20%', 'contract'),
('contract', '付款方式', 'low', '支付方式约定不明', '明确收款账户、付款时间', 'contract'),
('contract', '交付时间', 'low', '交付期限不明易争议', '具体到年/月/日', 'contract'),
('contract', '质量标准', 'medium', '标准不明易争议', '引用国标/行标或具体参数', 'contract'),

-- 劳动类 high
('labor', '自愿放弃', 'high', '"自愿放弃社保/加班费"等条款无效', '删去此条', 'labor'),
('labor', '末位淘汰', 'high', '不能作为解除劳动合同的合法依据', '改为绩效考核+培训+再评估', 'labor'),
('labor', '试用期', 'medium', '试用期时长和工资有法定限制', '按劳动合同法第19条执行', 'labor'),
('labor', '加班', 'medium', '加班费计算基数和倍数需明确', '1.5/2/3倍分别约定', 'labor'),
('labor', '竞业限制', 'medium', '需支付经济补偿才有效', '按月支付月平均工资30%以上', 'labor'),
('labor', '工伤', 'high', '用人单位不得约定排除工伤责任', '删去此类条款', 'labor'),
('labor', '培训费', 'medium', '服务期条款需明确', '约定具体服务期和违约金计算方式', 'labor'),
('labor', '规章制度', 'medium', '需经民主程序制定并公示', '保留职代会/工会讨论记录', 'labor'),

-- 通用 high
('general', '欺诈', 'high', '涉嫌欺诈可撤销合同', '避免虚假陈述', 'general'),
('general', '显失公平', 'high', '可请求撤销', '平衡双方权利义务', 'general'),
('general', '格式条款', 'medium', '免除自身责任、加重对方义务的无效', '采用提示或说明方式', 'general')
ON CONFLICT (category, keyword) DO NOTHING;

-- ============================================
-- 模板 seed（17 份常用法律文书模板）
-- ============================================
INSERT INTO templates (id, name, category, content, variables, description, is_public, created_by) VALUES
(gen_random_uuid(), '劳动合同（标准版）', 'contract',
'# 劳动合同

甲方（用人单位）：{{employer_name}}
乙方（劳动者）：{{employee_name}}
身份证号：{{id_card}}
签订日期：{{sign_date}}

## 第一条 合同期限
本合同为{{contract_type}}，期限为{{start_date}}至{{end_date}}。

## 第二条 工作内容
乙方从事{{position}}工作，工作地点为{{work_location}}。

## 第三条 工作时间
实行标准工时制，每日工作8小时，每周工作5天。

## 第四条 劳动报酬
月工资为人民币{{salary}}元，于每月{{pay_day}}日发放。

## 第五条 社会保险
甲方按国家和地方规定为乙方办理社会保险并缴纳社会保险费。

## 第六条 合同解除
按《劳动合同法》相关规定执行。

甲方（签章）：________________
乙方（签字）：________________
日期：{{sign_date}}',
'[{"name":"employer_name","label":"用人单位","required":true},{"name":"employee_name","label":"员工姓名","required":true},{"name":"id_card","label":"身份证号","required":true},{"name":"sign_date","label":"签订日期","required":true},{"name":"contract_type","label":"合同类型","required":true,"options":["固定期限","无固定期限","以完成任务为期限"]},{"name":"start_date","label":"开始日期","required":true},{"name":"end_date","label":"结束日期","required":false},{"name":"position","label":"工作岗位","required":true},{"name":"work_location","label":"工作地点","required":true},{"name":"salary","label":"月工资","required":true},{"name":"pay_day","label":"发薪日","required":true}]',
'标准劳动合同模板，适用于普通岗位',
true, 'system'),

(gen_random_uuid(), '解除劳动合同通知书', 'contract',
'# 解除劳动合同通知书

致：{{employee_name}}
身份证号：{{id_card}}
所在部门：{{department}}

根据《劳动合同法》{{legal_basis}}的规定，公司决定与您解除劳动合同。

## 解除理由
{{reason}}

## 经济补偿
公司将依法支付经济补偿金人民币{{compensation}}元。

## 最后工作日
您的最后工作日为{{last_work_day}}。

## 注意事项
1. 请于最后工作日前办理工作交接
2. 公司将依法出具解除劳动合同证明
3. 您的社保关系将转移至{{next_insurance}}

公司（盖章）：________________
日期：{{notice_date}}',
'[{"name":"employee_name","label":"员工姓名","required":true},{"name":"id_card","label":"身份证号","required":true},{"name":"department","label":"部门","required":true},{"name":"legal_basis","label":"法律依据","required":true,"options":["第三十九条","第四十条","第四十一条"]},{"name":"reason","label":"解除理由","required":true},{"name":"compensation","label":"补偿金","required":true},{"name":"last_work_day","label":"最后工作日","required":true},{"name":"next_insurance","label":"社保转出地","required":false},{"name":"notice_date","label":"通知日期","required":true}]',
'解除劳动合同通知模板',
true, 'system'),

(gen_random_uuid(), '催款函', 'letter',
'# 催款函

致：{{debtor_name}}
地址：{{debtor_address}}

根据{{contract_name}}（签订日期：{{contract_date}}），贵方应于{{due_date}}前支付人民币{{amount}}元。截至本函发出之日，{{overdue_days}}日已逾期。

## 违约责任
按合同第{{clause_num}}条规定，逾期付款违约金为日万分之{{penalty_rate}}，至{{current_date}}已累计{{total_penalty}}元。

## 付款要求
请贵方在收到本函后{{payment_deadline}}日内付清全部款项。

如未在期限内履行，我方将依法采取法律措施维护权益。

此致
敬礼！

债权人：{{creditor_name}}
日期：{{letter_date}}',
'[{"name":"debtor_name","label":"债务人","required":true},{"name":"debtor_address","label":"债务人地址","required":true},{"name":"contract_name","label":"合同名称","required":true},{"name":"contract_date","label":"合同签订日期","required":true},{"name":"due_date","label":"应付款日","required":true},{"name":"amount","label":"应付金额","required":true},{"name":"overdue_days","label":"逾期天数","required":true},{"name":"clause_num","label":"违约条款编号","required":true},{"name":"penalty_rate","label":"违约金日率","required":true},{"name":"current_date","label":"计算日期","required":true},{"name":"total_penalty","label":"累计违约金","required":true},{"name":"payment_deadline","label":"最后付款期限","required":true},{"name":"creditor_name","label":"债权人","required":true},{"name":"letter_date","label":"发函日期","required":true}]',
'标准催款函模板',
true, 'system'),

(gen_random_uuid(), '起诉状', 'brief',
'# 民事起诉状

原告：{{plaintiff_name}}
性别：{{plaintiff_gender}}
民族：{{plaintiff_ethnicity}}
出生日期：{{plaintiff_dob}}
身份证号：{{plaintiff_id}}
住所：{{plaintiff_address}}
联系电话：{{plaintiff_phone}}

被告：{{defendant_name}}
性别：{{defendant_gender}}
民族：{{defendant_ethnicity}}
出生日期：{{defendant_dob}}
身份证号：{{defendant_id}}
住所：{{defendant_address}}
联系电话：{{defendant_phone}}

## 诉讼请求
1. 判令被告{{request_1}}；
2. 判令被告承担本案诉讼费{{request_fee}}。

## 事实与理由
{{facts_and_reasons}}

此致
{{court_name}}

具状人：{{plaintiff_name}}
日期：{{filing_date}}',
'[{"name":"plaintiff_name","label":"原告姓名","required":true},{"name":"plaintiff_gender","label":"原告性别","required":true},{"name":"plaintiff_ethnicity","label":"民族","required":false},{"name":"plaintiff_dob","label":"出生日期","required":false},{"name":"plaintiff_id","label":"身份证号","required":true},{"name":"plaintiff_address","label":"住所","required":true},{"name":"plaintiff_phone","label":"联系电话","required":false},{"name":"defendant_name","label":"被告姓名","required":true},{"name":"defendant_gender","label":"被告性别","required":true},{"name":"defendant_ethnicity","label":"民族","required":false},{"name":"defendant_dob","label":"出生日期","required":false},{"name":"defendant_id","label":"被告身份证号","required":true},{"name":"defendant_address","label":"住所","required":true},{"name":"defendant_phone","label":"联系电话","required":false},{"name":"request_1","label":"第一项请求","required":true},{"name":"request_fee","label":"诉讼费","required":true},{"name":"facts_and_reasons","label":"事实与理由","required":true},{"name":"court_name","label":"受诉法院","required":true},{"name":"filing_date","label":"起诉日期","required":true}]',
'民事起诉状标准模板',
true, 'system'),

(gen_random_uuid(), '答辩状', 'brief',
'# 民事答辩状

答辩人：{{respondent_name}}
性别：{{respondent_gender}}
出生日期：{{respondent_dob}}
身份证号：{{respondent_id}}
住所：{{respondent_address}}

## 答辩事项
对原告{{plaintiff_name}}诉答辩人{{case_topic}}一案，答辩如下：

## 答辩理由
{{defense_reasons}}

## 答辩请求
1. 驳回原告的全部诉讼请求；
2. 本案诉讼费由原告承担。

此致
{{court_name}}

答辩人：{{respondent_name}}
日期：{{submission_date}}',
'[{"name":"respondent_name","label":"答辩人","required":true},{"name":"respondent_gender","label":"性别","required":true},{"name":"respondent_dob","label":"出生日期","required":false},{"name":"respondent_id","label":"身份证号","required":true},{"name":"respondent_address","label":"住所","required":true},{"name":"plaintiff_name","label":"原告","required":true},{"name":"case_topic","label":"案由","required":true},{"name":"defense_reasons","label":"答辩理由","required":true},{"name":"court_name","label":"受诉法院","required":true},{"name":"submission_date","label":"提交日期","required":true}]',
'民事答辩状模板',
true, 'system'),

(gen_random_uuid(), '律师函', 'letter',
'# 律师函

致：{{recipient_name}}
地址：{{recipient_address}}

我受{{client_name}}的委托，并经{{law_firm}}指派，就{{matter}}事宜函告如下：

## 事实依据
{{facts}}

## 法律意见
{{legal_opinion}}

## 要求事项
1. {{demand_1}}；
2. {{demand_2}}。

## 后果告知
如贵方未在{{deadline}}日内履行上述要求，我方委托人将依法采取包括但不限于诉讼、仲裁等措施，由此产生的一切法律后果由贵方承担。

特此函告。

律师：{{lawyer_name}}
{{law_firm}}
日期：{{letter_date}}',
'[{"name":"recipient_name","label":"收件人","required":true},{"name":"recipient_address","label":"收件人地址","required":true},{"name":"client_name","label":"委托人","required":true},{"name":"law_firm","label":"律所","required":true},{"name":"matter","label":"事项","required":true},{"name":"facts","label":"事实","required":true},{"name":"legal_opinion","label":"法律意见","required":true},{"name":"demand_1","label":"要求一","required":true},{"name":"demand_2","label":"要求二","required":false},{"name":"deadline","label":"履行期限","required":true},{"name":"lawyer_name","label":"律师","required":true},{"name":"letter_date","label":"发函日期","required":true}]',
'律师函标准模板',
true, 'system'),

(gen_random_uuid(), '离婚协议书', 'contract',
'# 离婚协议书

男方：{{husband_name}}
身份证号：{{husband_id}}
女方：{{wife_name}}
身份证号：{{wife_id}}

男女双方于{{marriage_date}}在{{marriage_place}}登记结婚，因{{divorce_reason}}自愿离婚，并就有关事项达成如下协议：

## 第一条 婚姻关系
双方自愿离婚。

## 第二条 子女抚养
- 子女姓名：{{child_name}}，出生于{{child_dob}}
- 抚养权归{{custodian}}
- 抚养费：每月{{child_support}}元，由{{payer}}支付

## 第三条 财产分割
{{property_division}}

## 第四条 债务分担
{{debt_arrangement}}

## 第五条 其他事项
{{other_terms}}

男方（签字）：________________
女方（签字）：________________
日期：{{agreement_date}}',
'[{"name":"husband_name","label":"男方","required":true},{"name":"husband_id","label":"男方身份证号","required":true},{"name":"wife_name","label":"女方","required":true},{"name":"wife_id","label":"女方身份证号","required":true},{"name":"marriage_date","label":"结婚日期","required":true},{"name":"marriage_place","label":"结婚地点","required":true},{"name":"divorce_reason","label":"离婚原因","required":false},{"name":"child_name","label":"子女姓名","required":false},{"name":"child_dob","label":"子女出生日期","required":false},{"name":"custodian","label":"抚养权人","required":false},{"name":"child_support","label":"抚养费","required":false},{"name":"payer","label":"支付方","required":false},{"name":"property_division","label":"财产分割","required":true},{"name":"debt_arrangement","label":"债务分担","required":true},{"name":"other_terms","label":"其他事项","required":false},{"name":"agreement_date","label":"协议日期","required":true}]',
'离婚协议书模板',
true, 'system'),

(gen_random_uuid(), '房屋租赁合同', 'contract',
'# 房屋租赁合同

出租方（甲方）：{{landlord_name}}
身份证号：{{landlord_id}}
联系地址：{{landlord_address}}
联系电话：{{landlord_phone}}

承租方（乙方）：{{tenant_name}}
身份证号：{{tenant_id}}
联系电话：{{tenant_phone}}

## 第一条 租赁房屋
甲方将位于{{property_address}}的房屋出租给乙方居住/使用。

## 第二条 租赁期限
自{{lease_start}}至{{lease_end}}，共计{{lease_duration}}。

## 第三条 租金与押金
- 月租金：人民币{{monthly_rent}}元
- 押金：人民币{{deposit}}元（合同终止且无违约时退还）
- 支付方式：{{payment_method}}
- 支付日期：每月{{pay_day}}日前

## 第四条 水电物业
租赁期间水费、电费、燃气费、物业费由{{utility_payer}}承担。

## 第五条 维修责任
房屋及附属设施的维修责任按{{maintenance_clause}}执行。

## 第六条 提前解约
任何一方提前解约需提前{{notice_days}}日书面通知对方，并支付违约金{{early_termination_fee}}元。

## 第七条 合同终止
合同期满乙方应将房屋归还甲方，乙方可续租。

甲方（签章）：________________
乙方（签字）：________________
日期：{{sign_date}}',
'[{"name":"landlord_name","label":"出租人","required":true},{"name":"landlord_id","label":"出租人身份证号","required":true},{"name":"landlord_address","label":"出租人地址","required":true},{"name":"landlord_phone","label":"出租人电话","required":true},{"name":"tenant_name","label":"承租人","required":true},{"name":"tenant_id","label":"承租人身份证号","required":true},{"name":"tenant_phone","label":"承租人电话","required":true},{"name":"property_address","label":"房屋地址","required":true},{"name":"lease_start","label":"起租日","required":true},{"name":"lease_end","label":"到期日","required":true},{"name":"lease_duration","label":"租期","required":true},{"name":"monthly_rent","label":"月租金","required":true},{"name":"deposit","label":"押金","required":true},{"name":"payment_method","label":"支付方式","required":true},{"name":"pay_day","label":"付款日","required":true},{"name":"utility_payer","label":"水电费承担方","required":true,"options":["乙方","甲方"]},{"name":"maintenance_clause","label":"维修条款","required":true},{"name":"notice_days","label":"提前通知天数","required":true},{"name":"early_termination_fee","label":"违约金","required":true},{"name":"sign_date","label":"签订日期","required":true}]',
'标准房屋租赁合同模板',
true, 'system'),

(gen_random_uuid(), '委托代理合同', 'contract',
'# 委托代理合同

委托方（甲方）：{{client_name}}
代理方（乙方）：{{agent_name}}（律师事务所）

## 委托事项
甲方因{{case_topic}}事宜，委托乙方律师代理。

## 代理权限
{{authority}}（一般代理/特别代理）

## 代理期限
自{{start_date}}至{{end_date}}。

## 律师费
- 固定收费：人民币{{fixed_fee}}元
- 风险代理：胜诉后按{{risk_ratio}}%比例支付
- 实际支出：交通、差旅、调查等实报实销

## 双方义务
甲方应如实陈述案件事实，提供相关证据。乙方应尽职代理，按时出庭。

## 解除条款
任何一方解除合同需提前{{notice_days}}日书面通知。

甲方（签章）：________________
乙方（签章）：________________
日期：{{sign_date}}',
'[{"name":"client_name","label":"委托方","required":true},{"name":"agent_name","label":"代理律师/律所","required":true},{"name":"case_topic","label":"案由","required":true},{"name":"authority","label":"代理权限","required":true},{"name":"start_date","label":"起始日期","required":true},{"name":"end_date","label":"结束日期","required":false},{"name":"fixed_fee","label":"固定费用","required":true},{"name":"risk_ratio","label":"风险代理比例","required":false},{"name":"notice_days","label":"提前通知天数","required":true},{"name":"sign_date","label":"签订日期","required":true}]',
'律师委托代理合同模板',
true, 'system'),

(gen_random_uuid(), '货款支付协议', 'contract',
'# 货款支付协议

甲方（债权人）：{{creditor_name}}
乙方（债务人）：{{debtor_name}}

鉴于甲乙双方存在{{original_contract}}项下的货款纠纷，现就分期支付事宜达成如下协议：

## 一、欠款确认
乙方确认截至{{confirm_date}}尚欠甲方货款人民币{{total_amount}}元（大写：{{amount_in_words}}）。

## 二、支付方式
乙方按以下方式分期支付：
- {{installment_1}}
- {{installment_2}}
- {{installment_3}}

## 三、利息
自{{interest_start}}起按月利率{{interest_rate}}%计收利息。

## 四、违约责任
任何一期未按期支付，乙方需支付违约金人民币{{penalty}}元，且剩余款项视为全部到期。

## 五、协议生效
本协议自双方签字之日起生效。

甲方（签章）：________________
乙方（签章）：________________
日期：{{sign_date}}',
'[{"name":"creditor_name","label":"债权人","required":true},{"name":"debtor_name","label":"债务人","required":true},{"name":"original_contract","label":"原合同","required":true},{"name":"confirm_date","label":"确认日期","required":true},{"name":"total_amount","label":"总金额","required":true},{"name":"amount_in_words","label":"大写金额","required":true},{"name":"installment_1","label":"第一期","required":true},{"name":"installment_2","label":"第二期","required":false},{"name":"installment_3","label":"第三期","required":false},{"name":"interest_start","label":"起息日","required":true},{"name":"interest_rate","label":"月利率","required":true},{"name":"penalty","label":"违约金","required":true},{"name":"sign_date","label":"签订日期","required":true}]',
'货款分期支付协议',
true, 'system'),

(gen_random_uuid(), '法律意见书', 'report',
'# 法律意见书

委托方：{{client_name}}
事项：{{matter}}
出具日期：{{issue_date}}

## 一、基本事实
{{facts}}

## 二、问题提出
{{questions}}

## 三、法律分析
{{legal_analysis}}

## 四、结论意见
{{conclusion}}

## 五、风险提示
{{risks}}

## 六、建议措施
{{suggestions}}

律师：{{lawyer_name}}
{{law_firm}}',
'[{"name":"client_name","label":"委托方","required":true},{"name":"matter","label":"事项","required":true},{"name":"issue_date","label":"出具日期","required":true},{"name":"facts","label":"事实","required":true},{"name":"questions","label":"问题","required":true},{"name":"legal_analysis","label":"法律分析","required":true},{"name":"conclusion","label":"结论","required":true},{"name":"risks","label":"风险","required":false},{"name":"suggestions","label":"建议","required":false},{"name":"lawyer_name","label":"律师","required":true},{"name":"law_firm","label":"律所","required":true}]',
'法律意见书模板',
true, 'system'),

(gen_random_uuid(), '交通事故赔偿清单', 'report',
'# 交通事故赔偿清单

事故日期：{{accident_date}}
事故地点：{{accident_location}}
当事人：{{party_name}}（甲方）
对方当事人：{{other_party}}（乙方）

## 一、医疗费
- 医疗费：{{medical_fee}}元
- 后续治疗费：{{follow_up_fee}}元

## 二、误工费
- 误工天数：{{lost_days}}天
- 日均工资：{{daily_wage}}元
- 误工费合计：{{lost_wages}}元

## 三、护理费
- 护理天数：{{nursing_days}}天
- 护理费：{{nursing_fee}}元

## 四、交通费
- 交通费：{{transport_fee}}元

## 五、住院伙食补助
- 住院{{hospital_days}}天
- 伙食补助：{{meal_allowance}}元

## 六、营养费
- 营养费：{{nutrition_fee}}元

## 七、财产损失
- 车辆维修：{{vehicle_repair}}元
- 财产损失：{{property_loss}}元

## 八、残疾赔偿金
- 伤残等级：{{disability_level}}级
- 残疾赔偿金：{{disability_compensation}}元

## 九、精神损害抚慰金
- 精神损害抚慰金：{{spiritual_compensation}}元

## 合计
总赔偿金额：人民币{{total_amount}}元（大写：{{amount_in_words}}）',
'[{"name":"accident_date","label":"事故日期","required":true},{"name":"accident_location","label":"事故地点","required":true},{"name":"party_name","label":"当事人","required":true},{"name":"other_party","label":"对方","required":true},{"name":"medical_fee","label":"医疗费","required":true},{"name":"follow_up_fee","label":"后续治疗费","required":false},{"name":"lost_days","label":"误工天数","required":true},{"name":"daily_wage","label":"日均工资","required":true},{"name":"lost_wages","label":"误工费","required":true},{"name":"nursing_days","label":"护理天数","required":false},{"name":"nursing_fee","label":"护理费","required":false},{"name":"transport_fee","label":"交通费","required":false},{"name":"hospital_days","label":"住院天数","required":false},{"name":"meal_allowance","label":"伙食补助","required":false},{"name":"nutrition_fee","label":"营养费","required":false},{"name":"vehicle_repair","label":"车辆维修","required":false},{"name":"property_loss","label":"财产损失","required":false},{"name":"disability_level","label":"伤残等级","required":false},{"name":"disability_compensation","label":"残疾赔偿金","required":false},{"name":"spiritual_compensation","label":"精神抚慰金","required":false},{"name":"total_amount","label":"合计","required":true},{"name":"amount_in_words","label":"大写金额","required":true}]',
'交通事故赔偿清单',
true, 'system'),

(gen_random_uuid(), '工伤认定申请书', 'brief',
'# 工伤认定申请书

申请人：{{applicant_name}}
用人单位：{{employer_name}}
受伤职工：{{injured_worker}}
受伤时间：{{injury_time}}
受伤地点：{{injury_location}}

## 申请事项
申请认定{{injured_worker}}于{{injury_time}}所受伤害为工伤。

## 事实与理由
{{facts_and_reasons}}

## 医疗诊断
诊断机构：{{hospital}}
诊断结果：{{diagnosis}}
医疗费用：{{medical_cost}}元

## 证人信息
{{witnesses}}

此致
{{labor_bureau}}

申请人：{{applicant_name}}
日期：{{application_date}}',
'[{"name":"applicant_name","label":"申请人","required":true},{"name":"employer_name","label":"用人单位","required":true},{"name":"injured_worker","label":"受伤职工","required":true},{"name":"injury_time","label":"受伤时间","required":true},{"name":"injury_location","label":"受伤地点","required":true},{"name":"facts_and_reasons","label":"事实与理由","required":true},{"name":"hospital","label":"诊断医院","required":true},{"name":"diagnosis","label":"诊断结果","required":true},{"name":"medical_cost","label":"医疗费","required":true},{"name":"witnesses","label":"证人信息","required":false},{"name":"labor_bureau","label":"劳动局","required":true},{"name":"application_date","label":"申请日期","required":true}]',
'工伤认定申请模板',
true, 'system'),

(gen_random_uuid(), '劳动仲裁申请书', 'brief',
'# 劳动仲裁申请书

申请人：{{applicant_name}}
性别：{{applicant_gender}}
出生日期：{{applicant_dob}}
身份证号：{{applicant_id}}
住址：{{applicant_address}}
联系电话：{{applicant_phone}}

被申请人：{{respondent_name}}
地址：{{respondent_address}}
统一社会信用代码：{{uscc}}
法定代表人：{{legal_representative}}
联系电话：{{respondent_phone}}

## 仲裁请求
1. {{request_1}}；
2. {{request_2}}；
3. 本案仲裁费由被申请人承担。

## 事实与理由
{{facts_and_reasons}}

此致
{{arbitration_committee}}

申请人（签名）：{{applicant_name}}
日期：{{filing_date}}',
'[{"name":"applicant_name","label":"申请人","required":true},{"name":"applicant_gender","label":"性别","required":true},{"name":"applicant_dob","label":"出生日期","required":false},{"name":"applicant_id","label":"身份证号","required":true},{"name":"applicant_address","label":"住址","required":true},{"name":"applicant_phone","label":"电话","required":true},{"name":"respondent_name","label":"被申请人","required":true},{"name":"respondent_address","label":"地址","required":true},{"name":"uscc","label":"信用代码","required":false},{"name":"legal_representative","label":"法定代表人","required":false},{"name":"respondent_phone","label":"电话","required":false},{"name":"request_1","label":"请求一","required":true},{"name":"request_2","label":"请求二","required":false},{"name":"facts_and_reasons","label":"事实与理由","required":true},{"name":"arbitration_committee","label":"仲裁委","required":true},{"name":"filing_date","label":"申请日期","required":true}]',
'劳动仲裁申请书模板',
true, 'system'),

(gen_random_uuid(), '遗嘱', 'contract',
'# 遗嘱

立遗嘱人：{{testator_name}}
身份证号：{{testator_id}}
住址：{{testator_address}}

## 一、遗嘱人基本信息
立遗嘱人{{testator_name}}，于{{test_date}}立本遗嘱，对本人名下财产作如下处分：

## 二、财产清单
{{property_list}}

## 三、继承安排
- 继承人姓名：{{heir_name}}，身份证号：{{heir_id}}，继承份额：{{inherit_share}}。

## 四、遗嘱生效
本遗嘱自遗嘱人去世时生效。如有其他遗嘱与本遗嘱冲突，以本遗嘱为准。

## 五、遗嘱保管
本遗嘱由{{custodian}}保管。

立遗嘱人（签字）：________________
日期：{{test_date}}',
'[{"name":"testator_name","label":"立遗嘱人","required":true},{"name":"testator_id","label":"身份证号","required":true},{"name":"testator_address","label":"住址","required":true},{"name":"test_date","label":"立遗嘱日期","required":true},{"name":"property_list","label":"财产清单","required":true},{"name":"heir_name","label":"继承人","required":true},{"name":"heir_id","label":"继承人身份证号","required":true},{"name":"inherit_share","label":"继承份额","required":true},{"name":"custodian","label":"保管人","required":false}]',
'自书遗嘱模板',
true, 'system'),

(gen_random_uuid(), '借款合同', 'contract',
'# 借款合同

出借人：{{lender_name}}
身份证号：{{lender_id}}
借款人：{{borrower_name}}
身份证号：{{borrower_id}}

## 借款金额
人民币{{loan_amount}}元（大写：{{amount_in_words}}）。

## 借款期限
自{{loan_start}}至{{loan_end}}。

## 借款利率
年利率{{interest_rate}}%（不超过合同成立时一年期贷款市场报价利率的四倍）。

## 借款用途
{{loan_purpose}}

## 还款方式
{{repayment_method}}。

## 违约责任
借款人未按期还款的，应按未还金额日万分之{{penalty_rate}}支付违约金。

## 担保方式
{{guarantee}}。

## 争议解决
本合同的签订、履行、解释均适用中华人民共和国法律。因本合同发生的争议，协商不成的，提交{{court}}管辖。

出借人（签字）：________________
借款人（签字）：________________
日期：{{sign_date}}',
'[{"name":"lender_name","label":"出借人","required":true},{"name":"lender_id","label":"出借人身份证号","required":true},{"name":"borrower_name","label":"借款人","required":true},{"name":"borrower_id","label":"借款人身份证号","required":true},{"name":"loan_amount","label":"借款金额","required":true},{"name":"amount_in_words","label":"大写金额","required":true},{"name":"loan_start","label":"借款起始日","required":true},{"name":"loan_end","label":"借款到期日","required":true},{"name":"interest_rate","label":"年利率","required":true},{"name":"loan_purpose","label":"借款用途","required":true},{"name":"repayment_method","label":"还款方式","required":true},{"name":"penalty_rate","label":"违约金日率","required":true},{"name":"guarantee","label":"担保方式","required":false},{"name":"court","label":"管辖法院","required":true},{"name":"sign_date","label":"签订日期","required":true}]',
'民间借款合同模板',
true, 'system'),

(gen_random_uuid(), '和解协议', 'contract',
'# 和解协议

甲方：{{party_a}}
乙方：{{party_b}}

鉴于{{dispute_topic}}，双方在平等、自愿的基础上达成如下和解协议：

## 一、纠纷事实
{{dispute_facts}}

## 二、和解方案
{{settlement_terms}}

## 三、双方义务
- 甲方义务：{{party_a_obligation}}
- 乙方义务：{{party_b_obligation}}

## 四、违约责任
如一方未履行本协议，应承担违约金人民币{{penalty}}元。

## 五、协议效力
本协议自双方签字之日起生效。履行完毕后，双方再无其他争议。

## 六、争议解决
如履行中发生争议，协商不成的，提交{{dispute_resolution}}。

甲方（签章）：________________
乙方（签章）：________________
日期：{{sign_date}}',
'[{"name":"party_a","label":"甲方","required":true},{"name":"party_b","label":"乙方","required":true},{"name":"dispute_topic","label":"纠纷主题","required":true},{"name":"dispute_facts","label":"纠纷事实","required":true},{"name":"settlement_terms","label":"和解方案","required":true},{"name":"party_a_obligation","label":"甲方义务","required":true},{"name":"party_b_obligation","label":"乙方义务","required":true},{"name":"penalty","label":"违约金","required":true},{"name":"dispute_resolution","label":"争议解决方式","required":true},{"name":"sign_date","label":"签订日期","required":true}]',
'通用和解协议模板',
true, 'system')
ON CONFLICT (id) DO NOTHING;
