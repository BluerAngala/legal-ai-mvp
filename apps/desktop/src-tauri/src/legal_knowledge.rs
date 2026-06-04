use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegalArticle {
    pub id: String,
    pub law_name: String,
    pub article_number: String,
    pub category: String,
    pub title: String,
    pub content: String,
    pub keywords: Vec<String>,
    pub scenarios: Vec<String>,
}

pub struct LegalKnowledgeBase {
    articles: Vec<LegalArticle>,
    index: HashMap<String, Vec<usize>>,
}

impl LegalKnowledgeBase {
    pub fn new() -> Self {
        let articles = Self::load_default_laws();
        let mut index: HashMap<String, Vec<usize>> = HashMap::new();
        
        for (i, article) in articles.iter().enumerate() {
            for keyword in &article.keywords {
                index.entry(keyword.clone()).or_insert_with(Vec::new).push(i);
            }
            for scenario in &article.scenarios {
                index.entry(scenario.clone()).or_insert_with(Vec::new).push(i);
            }
        }
        
        Self { articles, index }
    }
    
    pub fn search(&self, query: &str, limit: usize) -> Vec<LegalArticle> {
        let query_lower = query.to_lowercase();
        let query_words: Vec<String> = query_lower
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        
        // Score articles based on keyword matches
        let mut scores: Vec<(usize, f64)> = Vec::new();
        for (i, article) in self.articles.iter().enumerate() {
            let mut score = 0.0;
            
            // Direct keyword match
            for keyword in &article.keywords {
                if query_lower.contains(keyword) {
                    score += 2.0;
                }
            }
            
            // Scenario match
            for scenario in &article.scenarios {
                if query_lower.contains(scenario) {
                    score += 1.5;
                }
            }
            
            // Content match
            if article.content.to_lowercase().contains(&query_lower) {
                score += 1.0;
            }
            
            // Word-level match
            for word in &query_words {
                if word.len() >= 2 {
                    if article.content.contains(word) {
                        score += 0.3;
                    }
                    if article.title.contains(word) {
                        score += 0.5;
                    }
                }
            }
            
            if score > 0.0 {
                scores.push((i, score));
            }
        }
        
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        
        scores.into_iter()
            .take(limit)
            .map(|(i, _)| self.articles[i].clone())
            .collect()
    }
    
    pub fn detect_scenario(&self, query: &str) -> Option<String> {
        let scenarios = [
            ("劳动合同", vec!["劳动", "工资", "辞职", "辞退", "加班", "社保", "工伤", "劳动合同"]),
            ("婚姻家庭", vec!["离婚", "结婚", "抚养", "财产分割", "彩礼", "家暴", "继承"]),
            ("交通事故", vec!["车祸", "事故", "交通", "醉驾", "酒驾", "肇事", "保险理赔"]),
            ("合同纠纷", vec!["合同", "违约", "定金", "违约金", "履行", "解除合同", "合同条款"]),
            ("房产纠纷", vec!["房产", "租房", "买房", "房东", "物业", "拆迁", "房屋"]),
            ("侵权纠纷", vec!["侵权", "伤害", "医疗", "名誉", "隐私", "知识产权", "商标"]),
            ("刑事案件", vec!["刑事", "犯罪", "诈骗", "盗窃", "抢劫", "故意伤害", "取保候审"]),
            ("债权债务", vec!["债务", "欠款", "借款", "借条", "债权", "担保", "抵押"]),
        ];
        
        for (scenario, keywords) in scenarios {
            for keyword in keywords {
                if query.contains(keyword) {
                    return Some(scenario.to_string());
                }
            }
        }
        None
    }
    
    pub fn answer_question(&self, query: &str) -> AnswerResponse {
        let articles = self.search(query, 5);
        let scenario = self.detect_scenario(query);
        
        let confidence = if articles.len() >= 3 { 0.92 } 
                        else if articles.len() >= 1 { 0.78 } 
                        else { 0.3 };
        
        let (answer, suggestions) = self.generate_answer(query, &articles, scenario.as_deref());
        
        AnswerResponse {
            answer,
            articles,
            scenario,
            confidence,
            suggestions,
        }
    }
    
    fn generate_answer(&self, query: &str, articles: &[LegalArticle], scenario: Option<&str>) -> (String, Vec<String>) {
        if articles.is_empty() {
            return (
                "抱歉，您的问题暂无明确法律依据。建议您：\n1. 重新描述问题，提供更多具体信息\n2. 咨询专业律师获取个性化建议".to_string(),
                vec![
                    "请提供更多问题细节".to_string(),
                    "可以咨询当地律师事务所".to_string(),
                ],
            );
        }
        
        let mut answer = String::new();
        
        if let Some(s) = scenario {
            answer.push_str(&format!("【场景识别】{}\n\n", s));
        }
        
        answer.push_str("【法律依据】\n");
        for (i, article) in articles.iter().take(3).enumerate() {
            answer.push_str(&format!(
                "{}. 《{}》第{}条 - {}\n   {}\n\n",
                i + 1,
                article.law_name,
                article.article_number,
                article.title,
                article.content
            ));
        }
        
        answer.push_str("【建议】\n");
        for article in articles.iter().take(2) {
            for keyword in &article.keywords {
                if query.contains(keyword) {
                    answer.push_str(&format!("• 关注「{}」相关条款\n", keyword));
                }
            }
        }
        
        let suggestions = vec![
            "查看完整条文".to_string(),
            "保存为咨询记录".to_string(),
            "联系专业律师".to_string(),
        ];
        
        (answer, suggestions)
    }
    
    fn load_default_laws() -> Vec<LegalArticle> {
        vec![
            // ===== 民法典 - 合同编 =====
            LegalArticle {
                id: "civ-577".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "577".to_string(),
                category: "合同纠纷".to_string(),
                title: "违约责任".to_string(),
                content: "当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。".to_string(),
                keywords: vec!["违约".to_string(), "合同".to_string(), "责任".to_string()],
                scenarios: vec!["合同纠纷".to_string(), "违约".to_string()],
            },
            LegalArticle {
                id: "civ-585".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "585".to_string(),
                category: "合同纠纷".to_string(),
                title: "违约金".to_string(),
                content: "当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金，也可以约定因违约产生的损失赔偿额的计算方法。约定的违约金低于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以增加；约定的违约金过分高于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以适当减少。".to_string(),
                keywords: vec!["违约金".to_string(), "违约".to_string(), "赔偿".to_string()],
                scenarios: vec!["合同纠纷".to_string(), "违约金".to_string()],
            },
            LegalArticle {
                id: "civ-533".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "533".to_string(),
                category: "合同纠纷".to_string(),
                title: "情势变更".to_string(),
                content: "合同成立后，合同的基础条件发生了当事人在订立合同时无法预见的、不属于商业风险的重大变化，继续履行合同对于当事人一方明显不公平的，受不利影响的当事人可以与对方重新协商；在合理期限内协商不成的，当事人可以请求人民法院或者仲裁机构变更或者解除合同。".to_string(),
                keywords: vec!["情势变更".to_string(), "合同变更".to_string(), "解除合同".to_string()],
                scenarios: vec!["合同纠纷".to_string()],
            },
            LegalArticle {
                id: "civ-530".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "530".to_string(),
                category: "合同纠纷".to_string(),
                title: "合同解除".to_string(),
                content: "当事人一方未通知对方，直接以提起诉讼或者申请仲裁的方式依法主张解除合同，人民法院或者仲裁机构确认该主张的，合同自起诉状副本或者仲裁申请书副本送达对方时解除。".to_string(),
                keywords: vec!["合同解除".to_string(), "解除".to_string()],
                scenarios: vec!["合同纠纷".to_string()],
            },
            LegalArticle {
                id: "civ-586".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "586".to_string(),
                category: "合同纠纷".to_string(),
                title: "定金".to_string(),
                content: "当事人可以约定一方向对方给付定金作为债权的担保。定金合同自实际交付定金时成立。定金的数额由当事人约定；但是，不得超过主合同标的额的百分之二十，超过部分不产生定金的效力。实际交付的定金数额多于或者少于约定数额，视为变更约定的定金数额。".to_string(),
                keywords: vec!["定金".to_string(), "担保".to_string()],
                scenarios: vec!["合同纠纷".to_string()],
            },
            
            // ===== 民法典 - 婚姻家庭编 =====
            LegalArticle {
                id: "civ-1076".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "1076".to_string(),
                category: "婚姻家庭".to_string(),
                title: "协议离婚".to_string(),
                content: "夫妻双方自愿离婚的，应当签订书面离婚协议，并亲自到婚姻登记机关申请离婚登记。离婚协议应当载明双方自愿离婚的意思表示和对子女抚养、财产以及债务处理等事项协商一致的意见。".to_string(),
                keywords: vec!["离婚".to_string(), "协议".to_string(), "离婚协议".to_string()],
                scenarios: vec!["婚姻家庭".to_string(), "离婚".to_string()],
            },
            LegalArticle {
                id: "civ-1079".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "1079".to_string(),
                category: "婚姻家庭".to_string(),
                title: "诉讼离婚".to_string(),
                content: "夫妻一方要求离婚的，可以由有关组织进行调解或者直接向人民法院提起离婚诉讼。人民法院审理离婚案件，应当进行调解；如果感情确已破裂，调解无效的，应当准予离婚。有下列情形之一，调解无效的，应当准予离婚：（一）重婚或者与他人同居；（二）实施家庭暴力或者虐待、遗弃家庭成员；（三）有赌博、吸毒等恶习屡教不改；（四）因感情不和分居满二年；（五）其他导致夫妻感情破裂的情形。".to_string(),
                keywords: vec!["离婚".to_string(), "诉讼离婚".to_string(), "家暴".to_string(), "感情破裂".to_string()],
                scenarios: vec!["婚姻家庭".to_string(), "离婚".to_string()],
            },
            LegalArticle {
                id: "civ-1087".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "1087".to_string(),
                category: "婚姻家庭".to_string(),
                title: "离婚财产分割".to_string(),
                content: "离婚时，夫妻的共同财产由双方协议处理；协议不成的，由人民法院根据财产的具体情况，按照照顾子女、女方和无过错方权益的原则判决。对夫或者妻在家庭土地承包经营中享有的权益等，应当依法予以保护。".to_string(),
                keywords: vec!["财产分割".to_string(), "离婚".to_string(), "共同财产".to_string()],
                scenarios: vec!["婚姻家庭".to_string(), "离婚".to_string()],
            },
            
            // ===== 民法典 - 侵权责任编 =====
            LegalArticle {
                id: "civ-1165".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "1165".to_string(),
                category: "侵权纠纷".to_string(),
                title: "一般侵权责任".to_string(),
                content: "行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。依照法律规定推定行为人有过错，其不能证明自己没有过错的，应当承担侵权责任。".to_string(),
                keywords: vec!["侵权".to_string(), "过错".to_string(), "责任".to_string()],
                scenarios: vec!["侵权纠纷".to_string()],
            },
            LegalArticle {
                id: "civ-1179".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "1179".to_string(),
                category: "侵权纠纷".to_string(),
                title: "人身损害赔偿".to_string(),
                content: "侵害他人造成人身损害的，应当赔偿医疗费、护理费、交通费、营养费、住院伙食补助费等为治疗和康复支出的合理费用，以及因误工减少的收入。造成残疾的，还应当赔偿辅助器具费和残疾赔偿金；造成死亡的，还应当赔偿丧葬费和死亡赔偿金。".to_string(),
                keywords: vec!["人身损害".to_string(), "赔偿".to_string(), "医疗费".to_string(), "残疾".to_string()],
                scenarios: vec!["侵权纠纷".to_string(), "交通事故".to_string()],
            },
            
            // ===== 劳动法 =====
            LegalArticle {
                id: "lab-36".to_string(),
                law_name: "中华人民共和国劳动法".to_string(),
                article_number: "36".to_string(),
                category: "劳动合同".to_string(),
                title: "工时制度".to_string(),
                content: "国家实行劳动者每日工作时间不超过八小时、平均每周工作时间不超过四十四小时的工时制度。".to_string(),
                keywords: vec!["工时".to_string(), "工作时间".to_string(), "加班".to_string()],
                scenarios: vec!["劳动合同".to_string(), "加班".to_string()],
            },
            LegalArticle {
                id: "lab-44".to_string(),
                law_name: "中华人民共和国劳动法".to_string(),
                article_number: "44".to_string(),
                category: "劳动合同".to_string(),
                title: "加班工资".to_string(),
                content: "有下列情形之一的，用人单位应当按照下列标准支付高于劳动者正常工作时间工资的工资报酬：（一）安排劳动者延长工作时间的，支付不低于工资的百分之一百五十的工资报酬；（二）休息日安排劳动者工作又不能安排补休的，支付不低于工资的百分之二百的工资报酬；（三）法定休假日安排劳动者工作的，支付不低于工资的百分之三百的工资报酬。".to_string(),
                keywords: vec!["加班".to_string(), "加班工资".to_string(), "工资".to_string()],
                scenarios: vec!["劳动合同".to_string(), "加班".to_string()],
            },
            LegalArticle {
                id: "lab-87".to_string(),
                law_name: "中华人民共和国劳动合同法".to_string(),
                article_number: "87".to_string(),
                category: "劳动合同".to_string(),
                title: "违法解除赔偿".to_string(),
                content: "用人单位违反本法规定解除或者终止劳动合同的，应当依照本法第四十七条规定的经济补偿标准的二倍向劳动者支付赔偿金。".to_string(),
                keywords: vec!["违法解除".to_string(), "辞退".to_string(), "赔偿金".to_string(), "劳动合同".to_string()],
                scenarios: vec!["劳动合同".to_string(), "辞退".to_string()],
            },
            LegalArticle {
                id: "lab-39".to_string(),
                law_name: "中华人民共和国劳动合同法".to_string(),
                article_number: "39".to_string(),
                category: "劳动合同".to_string(),
                title: "过失性辞退".to_string(),
                content: "劳动者有下列情形之一的，用人单位可以解除劳动合同：（一）在试用期间被证明不符合录用条件的；（二）严重违反用人单位的规章制度的；（三）严重失职，营私舞弊，给用人单位造成重大损害的；（四）劳动者同时与其他用人单位建立劳动关系，对完成本单位的工作任务造成严重影响，或者经用人单位提出，拒不改正的；（五）因本法第二十六条第一款第一项规定的情形致使劳动合同无效的；（六）被依法追究刑事责任的。".to_string(),
                keywords: vec!["辞退".to_string(), "解除合同".to_string(), "试用期".to_string()],
                scenarios: vec!["劳动合同".to_string(), "辞退".to_string()],
            },
            
            // ===== 道路交通安全法 =====
            LegalArticle {
                id: "traf-76".to_string(),
                law_name: "中华人民共和国道路交通安全法".to_string(),
                article_number: "76".to_string(),
                category: "交通事故".to_string(),
                title: "机动车事故责任".to_string(),
                content: "机动车发生交通事故造成人身伤亡、财产损失的，由保险公司在机动车第三者责任强制保险责任限额范围内予以赔偿；不足的部分，按照下列规定承担赔偿责任：（一）机动车之间发生交通事故的，由有过错的一方承担赔偿责任；双方都有过错的，按照各自过错的比例分担责任。".to_string(),
                keywords: vec!["交通事故".to_string(), "车祸".to_string(), "责任".to_string(), "保险".to_string()],
                scenarios: vec!["交通事故".to_string()],
            },
            LegalArticle {
                id: "traf-91".to_string(),
                law_name: "中华人民共和国道路交通安全法".to_string(),
                article_number: "91".to_string(),
                category: "交通事故".to_string(),
                title: "酒驾处罚".to_string(),
                content: "饮酒后驾驶机动车的，处暂扣六个月机动车驾驶证，并处一千元以上二千元以下罚款。因饮酒后驾驶机动车被处罚，再次饮酒后驾驶机动车的，处十日以下拘留，并处一千元以上二千元以下罚款，吊销机动车驾驶证。醉酒驾驶机动车的，由公安机关交通管理部门约束至酒醒，吊销机动车驾驶证，依法追究刑事责任；五年内不得重新取得机动车驾驶证。".to_string(),
                keywords: vec!["酒驾".to_string(), "醉驾".to_string(), "驾驶证".to_string()],
                scenarios: vec!["交通事故".to_string(), "刑事案件".to_string()],
            },
            
            // ===== 刑法 =====
            LegalArticle {
                id: "crim-266".to_string(),
                law_name: "中华人民共和国刑法".to_string(),
                article_number: "266".to_string(),
                category: "刑事案件".to_string(),
                title: "诈骗罪".to_string(),
                content: "诈骗公私财物，数额较大的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金；数额巨大或者有其他严重情节的，处三年以上十年以下有期徒刑，并处罚金；数额特别巨大或者有其他特别严重情节的，处十年以上有期徒刑或者无期徒刑，并处罚金或者没收财产。".to_string(),
                keywords: vec!["诈骗".to_string(), "诈骗罪".to_string(), "刑事".to_string()],
                scenarios: vec!["刑事案件".to_string(), "债权债务".to_string()],
            },
            LegalArticle {
                id: "crim-234".to_string(),
                law_name: "中华人民共和国刑法".to_string(),
                article_number: "234".to_string(),
                category: "刑事案件".to_string(),
                title: "故意伤害罪".to_string(),
                content: "故意伤害他人身体的，处三年以下有期徒刑、拘役或者管制。犯前款罪，致人重伤的，处三年以上十年以下有期徒刑；致人死亡或者以特别残忍手段致人重伤造成严重残疾的，处十年以上有期徒刑、无期徒刑或者死刑。".to_string(),
                keywords: vec!["故意伤害".to_string(), "伤害".to_string(), "刑事".to_string()],
                scenarios: vec!["刑事案件".to_string(), "侵权纠纷".to_string()],
            },
            LegalArticle {
                id: "crim-264".to_string(),
                law_name: "中华人民共和国刑法".to_string(),
                article_number: "264".to_string(),
                category: "刑事案件".to_string(),
                title: "盗窃罪".to_string(),
                content: "盗窃公私财物，数额较大的，或者多次盗窃、入户盗窃、携带凶器盗窃、扒窃的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金；数额巨大或者有其他严重情节的，处三年以上十年以下有期徒刑，并处罚金；数额特别巨大或者有其他特别严重情节的，处十年以上有期徒刑或者无期徒刑，并处罚金或者没收财产。".to_string(),
                keywords: vec!["盗窃".to_string(), "盗窃罪".to_string()],
                scenarios: vec!["刑事案件".to_string()],
            },
            
            // ===== 民事诉讼法 =====
            LegalArticle {
                id: "proc-119".to_string(),
                law_name: "中华人民共和国民事诉讼法".to_string(),
                article_number: "119".to_string(),
                category: "诉讼程序".to_string(),
                title: "起诉条件".to_string(),
                content: "起诉必须符合下列条件：（一）原告是与本案有直接利害关系的公民、法人和其他组织；（二）有明确的被告；（三）有具体的诉讼请求和事实、理由；（四）属于人民法院受理民事诉讼的范围和受诉人民法院管辖。".to_string(),
                keywords: vec!["起诉".to_string(), "诉讼".to_string(), "法院".to_string()],
                scenarios: vec!["诉讼程序".to_string()],
            },
            LegalArticle {
                id: "proc-188".to_string(),
                law_name: "中华人民共和国民事诉讼法".to_string(),
                article_number: "188".to_string(),
                category: "诉讼程序".to_string(),
                title: "诉讼时效".to_string(),
                content: "向人民法院请求保护民事权利的诉讼时效期间为三年。法律另有规定的，依照其规定。诉讼时效期间自权利人知道或者应当知道权利受到损害以及义务人之日起计算。法律另有规定的，依照其规定。但是，自权利受到损害之日起超过二十年的，人民法院不予保护，有特殊情况的，人民法院可以根据权利人的申请决定延长。".to_string(),
                keywords: vec!["诉讼时效".to_string(), "时效".to_string(), "三年".to_string()],
                scenarios: vec!["诉讼程序".to_string()],
            },
            
            // ===== 继承法（民法典继承编） =====
            LegalArticle {
                id: "civ-1123".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "1123".to_string(),
                category: "婚姻家庭".to_string(),
                title: "继承方式".to_string(),
                content: "继承开始后，按照法定继承办理；有遗嘱的，按照遗嘱继承或者遗赠办理；有遗赠扶养协议的，按照协议办理。".to_string(),
                keywords: vec!["继承".to_string(), "遗嘱".to_string(), "法定继承".to_string()],
                scenarios: vec!["婚姻家庭".to_string(), "继承".to_string()],
            },
            LegalArticle {
                id: "civ-1133".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "1133".to_string(),
                category: "婚姻家庭".to_string(),
                title: "遗嘱继承".to_string(),
                content: "自然人可以依照本法规定立遗嘱处分个人财产，并可以指定遗嘱执行人。自然人可以立遗嘱将个人财产指定由法定继承人中的一人或者数人继承。自然人可以立遗嘱将个人财产赠与国家、集体或者法定继承人以外的组织、个人。自然人可以依法设立遗嘱信托。".to_string(),
                keywords: vec!["遗嘱".to_string(), "继承".to_string()],
                scenarios: vec!["婚姻家庭".to_string(), "继承".to_string()],
            },
            
            // ===== 物业管理 =====
            LegalArticle {
                id: "civ-942".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "942".to_string(),
                category: "房产纠纷".to_string(),
                title: "物业服务合同".to_string(),
                content: "物业服务人应当按照约定和物业的使用性质，妥善维修、养护、清洁、绿化和经营管理业主共有的部分，维护物业服务区域内的基本秩序，采取合理措施保护业主的人身、财产安全。".to_string(),
                keywords: vec!["物业".to_string(), "服务".to_string()],
                scenarios: vec!["房产纠纷".to_string()],
            },
            
            // ===== 借款合同 =====
            LegalArticle {
                id: "civ-667".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "667".to_string(),
                category: "债权债务".to_string(),
                title: "借款合同定义".to_string(),
                content: "借款合同是借款人向贷款人借款，到期返还借款并支付利息的合同。".to_string(),
                keywords: vec!["借款".to_string(), "借款合同".to_string(), "债务".to_string()],
                scenarios: vec!["债权债务".to_string()],
            },
            LegalArticle {
                id: "civ-675".to_string(),
                law_name: "中华人民共和国民法典".to_string(),
                article_number: "675".to_string(),
                category: "债权债务".to_string(),
                title: "还款期限".to_string(),
                content: "借款人应当按照约定的期限返还借款。对借款期限没有约定或者约定不明确，依据本法第五百一十条的规定仍不能确定的，借款人可以随时返还；贷款人可以催告借款人在合理期限内返还。".to_string(),
                keywords: vec!["还款".to_string(), "借款".to_string(), "欠款".to_string()],
                scenarios: vec!["债权债务".to_string()],
            },
         ]
     }
 }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnswerResponse {
    pub answer: String,
    pub articles: Vec<LegalArticle>,
    pub scenario: Option<String>,
    pub confidence: f64,
    pub suggestions: Vec<String>,
}
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_labor_question() {
        let kb = LegalKnowledgeBase::new();
        let response = kb.answer_question("老板拖欠工资怎么办");
        assert!(!response.articles.is_empty());
        assert!(response.confidence > 0.3);
    }
    
    #[test]
    fn test_scenario_detection() {
        let kb = LegalKnowledgeBase::new();
        assert_eq!(kb.detect_scenario("离婚财产"), Some("婚姻家庭".to_string()));
        assert_eq!(kb.detect_scenario("酒驾"), Some("交通事故".to_string()));
        assert_eq!(kb.detect_scenario("加班费"), Some("劳动合同".to_string()));
    }
}
#[test]
fn test_full_qa_flow() {
    let kb = LegalKnowledgeBase::new();
    
    // Test 1: 劳动纠纷
    let r1 = kb.answer_question("老板拖欠工资怎么办？");
    assert!(!r1.articles.is_empty(), "Should find articles");
    assert!(r1.answer.contains("法律依据"));
    
    // Test 2: 婚姻家庭
    let r2 = kb.answer_question("夫妻离婚财产怎么分？");
    assert!(!r2.articles.is_empty());
    assert_eq!(r2.scenario, Some("婚姻家庭".to_string()));
    
    // Test 3: 交通事故
    let r3 = kb.answer_question("酒驾被抓会怎么处罚？");
    assert!(!r3.articles.is_empty());
    assert_eq!(r3.scenario, Some("交通事故".to_string()));
    
    // Test 4: 合同
    let r4 = kb.answer_question("合同违约金多少合理？");
    assert!(!r4.articles.is_empty());
    assert!(r4.articles.iter().any(|a| a.content.contains("违约金")));
    
    println!("All 4 test cases passed!");
}
