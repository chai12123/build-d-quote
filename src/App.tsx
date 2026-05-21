import { useState, useMemo, useEffect, useRef } from "react";
import { 
  Home, 
  Layers, 
  Building, 
  Sparkles, 
  Info, 
  Check, 
  RotateCcw, 
  User, 
  Phone, 
  ArrowRight,
  ExternalLink,
  MessageSquare,
  Waves,
  Calculator,
  CheckCircle2,
  Lock,
  ChevronDown,
  Layout
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

/**
 * =========================================================================
 * ⚙️ CONFIGURATION FOR BUILT D ESTIMATOR (คอนฟิกูเรชันสำหรับผู้ดูแลระบบ)
 * =========================================================================
 * คุณสามารถแก้ไขตัวแปร ราคา อัตราค่าออกแบบ หรือ LINE ID หลักของบริษัทที่นี่ได้เลย
 * โค้ดทั้งหมดจะคำนวณตามตัวแปรเหล่านี้โดยอัตโนมัติ
 */
const CONFIG = {
  // 🟢 บัญชีทางการ LINE Official Account ของบริษัท 
  // *** เปลี่ยนเป็น LINE ID จริงของร้านค้าในอนาคต (เช่น "@builtd" หรืออื่นๆ) ***
  LINE_OA_ID: "@builtd",

  // 🏛️ ราคาค่าก่อสร้างเฉลี่ย ต่อ ตารางเมตร (บาท / ตร.ม.) แบ่งตามเกรดวัสดุ
  PRICES: {
    STANDARD: 13000,   // วัสดุเกรดมาตรฐาน (ประหยัด คุ้มค่า)
    GOOD: 17000,       // วัสดุเกรดดี (งานเนี้ยบ วัสดุแบรนด์คุ้นหู)
    PREMIUM: 27000,    // วัสดุเกรดพรีเมียม (นำเข้าพิเศษ ดีไซน์เฉพาะตัว)
  },

  // 🏊‍♂️ ราคาค่าก่อสร้างสระว่ายน้ำต่อตารางเมตร (บาท / ตร.ม.)
  POOL_PRICE_PER_SQM: 12000,

  // 🌤️ สัดส่วนราคาพื้นที่กึ่งเปิดโลก (เช่น ระเบียง โรงรถ คิดเป็น 55% ของราคาปกติ)
  SEMI_OPEN_FACTOR: 0.55,

  // 💸 อัตราสัดส่วนการคำนวณค่าออกแบบสถาปัตยกรรมแบบขั้นบันได (สมาคมสถาปนิกสยาม - ASA)
  // [ช่วงมูลค่าโครงการก่อสร้าง (บาท), อัตราค่าบริการออกแบบสถาปนิก]
  DESIGN_BRACKETS: [
    { limit: 10000000, rate: 0.075 },  // 10 ล้านแรก คิดสูงสุด 7.5%
    { limit: 30000000, rate: 0.060 },  // ส่วนที่เกิน 10 ล้าน ถึง 30 ล้าน คิด 6.0%
    { limit: 50000000, rate: 0.050 },  // ส่วนที่เกิน 30 ล้าน ถึง 50 ล้าน คิด 5.0%
    { limit: Infinity, rate: 0.0425 }, // ส่วนที่สะสมเกิน 50 ล้านบาทขึ้นไป คิด 4.25%
  ],

  // 📈 ช่วงราคาประเมินเผื่อกรณีพิเศษบวก/ลบ (±10% เพื่อความสมจริงในการประเมิน)
  VARIANCE_FACTOR: 0.10,

  // 🪙 อัตราภาษีมูลค่าเพิ่ม (VAT) ในปัจจุบัน (7%)
  VAT_RATE: 0.07
};

export default function App() {
  // --- STATE VARIABLES ---
  const [houseType, setHouseType] = useState<"1-story" | "2-story" | "3-story">("2-story");
  const [materialGrade, setMaterialGrade] = useState<"standard" | "good" | "premium">("good");
  const [internalArea, setInternalArea] = useState<number>(180);
  const [semiOpenArea, setSemiOpenArea] = useState<number>(40);
  const [hasPool, setHasPool] = useState<boolean>(false);
  const [poolArea, setPoolArea] = useState<number>(24);
  const [wantsDesignService, setWantsDesignService] = useState<boolean>(true);

  // ข้อมูลลูกค้าสำหรับเก็บ Lead
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [touchedName, setTouchedName] = useState<boolean>(false);
  const [touchedPhone, setTouchedPhone] = useState<boolean>(false);

  // สถานะแจ้งเตือนส่งข้อมูลสำเร็จ / ส่งต่อไปยัง LINE
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);

  // สำหรับ Reference ในการ Scroll ไปที่ส่วนรับใบเสนอราคา
  const leadSectionRef = useRef<HTMLDivElement>(null);

  // --- CALCULATION LOGIC ---
  const calculationResult = useMemo(() => {
    // 1. ดึงค่าราคาก่อสร้างต่อ ตร.ม. ตามเกรดวัสดุที่เลือก
    let basePricePerSqm = CONFIG.PRICES.GOOD;
    if (materialGrade === "standard") basePricePerSqm = CONFIG.PRICES.STANDARD;
    else if (materialGrade === "premium") basePricePerSqm = CONFIG.PRICES.PREMIUM;

    // 2. คำนวณค่าก่อสร้างภายใน
    // ป้องกันค่าติดลบ
    const safeInternalArea = Math.max(0, internalArea);
    const internalCost = safeInternalArea * basePricePerSqm;

    // 3. คำนวณค่าก่อสร้างกึ่งเปิดโล่ง (คิดเป็น 55% ของราคาต่อ ตร.ม. ปกติ)
    const safeSemiOpenArea = Math.max(0, semiOpenArea);
    const semiOpenPricePerSqm = basePricePerSqm * CONFIG.SEMI_OPEN_FACTOR;
    const semiOpenCost = safeSemiOpenArea * semiOpenPricePerSqm;

    // 4. คำนวณค่าสระว่ายน้ำ (ถ้ามี)
    const safePoolArea = hasPool ? Math.max(0, poolArea) : 0;
    const poolCost = safePoolArea * CONFIG.POOL_PRICE_PER_SQM;

    // 5. รวมค่าก่อสร้างรวมทั้งหมด
    const totalConstructionCost = internalCost + semiOpenCost + poolCost;

    // 6. คำนวณค่าบริการออกแบบสถาปัตยกรรม (แบบขั้นบันไดสะสม)
    let designFee = 0;
    if (wantsDesignService && totalConstructionCost > 0) {
      let remainingCost = totalConstructionCost;
      let lastLimit = 0;

      for (const bracket of CONFIG.DESIGN_BRACKETS) {
        if (remainingCost <= 0) break;
        
        // ช่วงราคาที่อยู่ภายใต้ขั้นนี้
        const currentTierSpan = bracket.limit - lastLimit;
        const costInThisTier = Math.min(remainingCost, currentTierSpan);
        
        designFee += costInThisTier * bracket.rate;
        
        remainingCost -= costInThisTier;
        lastLimit = bracket.limit;
      }
    }

    // 7. คำนวณราคารวมก่อน VAT
    const totalBeforeVat = totalConstructionCost + designFee;

    // 8. ภาษีมูลค่าเพิ่ม VAT 7%
    const vatValue = totalBeforeVat * CONFIG.VAT_RATE;

    // 9. ราคารวมสุทธิโดยประมาณ
    const totalWithVat = totalBeforeVat + vatValue;

    // 10. ช่วงราคา ±10%
    const minPrice = totalWithVat * (1 - CONFIG.VARIANCE_FACTOR);
    const maxPrice = totalWithVat * (1 + CONFIG.VARIANCE_FACTOR);

    // ปัดเศษให้อยู่ในหลักพัน ถ้วนๆ เพื่อความสวยงามพรีเมียม
    const roundedMin = Math.round(minPrice / 1000) * 1000;
    const roundedMax = Math.round(maxPrice / 1000) * 1000;
    const roundedApprox = Math.round(totalWithVat / 1000) * 1000;

    return {
      internalCost,
      semiOpenCost,
      poolCost,
      totalConstructionCost,
      designFee,
      totalBeforeVat,
      vatValue,
      totalWithVat: roundedApprox,
      minPrice: roundedMin,
      maxPrice: roundedMax,
      basePricePerSqm,
      semiOpenPricePerSqm
    };
  }, [houseType, materialGrade, internalArea, semiOpenArea, hasPool, poolArea, wantsDesignService]);

  // --- PRESETS LOADERS ---
  const loadPreset = (presetType: "compact" | "family" | "luxury") => {
    if (presetType === "compact") {
      setHouseType("1-story");
      setMaterialGrade("standard");
      setInternalArea(80);
      setSemiOpenArea(20);
      setHasPool(false);
      setWantsDesignService(false);
    } else if (presetType === "family") {
      setHouseType("2-story");
      setMaterialGrade("good");
      setInternalArea(210);
      setSemiOpenArea(45);
      setHasPool(false);
      setWantsDesignService(true);
    } else if (presetType === "luxury") {
      setHouseType("3-story");
      setMaterialGrade("premium");
      setInternalArea(420);
      setSemiOpenArea(90);
      setHasPool(true);
      setPoolArea(32);
      setWantsDesignService(true);
    }
  };

  // --- RESET FUNCTION ---
  const handleReset = () => {
    setHouseType("2-story");
    setMaterialGrade("good");
    setInternalArea(150);
    setSemiOpenArea(30);
    setHasPool(false);
    setPoolArea(24);
    setWantsDesignService(true);
    setCustomerName("");
    setCustomerPhone("");
    setTouchedName(false);
    setTouchedPhone(false);
  };

  // --- FORM VALIDATION ---
  const isPhoneValid = useMemo(() => {
    const cleanNum = customerPhone.replace(/[^0-9]/g, "");
    return cleanNum.length >= 9 && cleanNum.length <= 10;
  }, [customerPhone]);

  const isFormValid = useMemo(() => {
    return customerName.trim().length > 0 && isPhoneValid;
  }, [customerName, isPhoneValid]);

  // --- SCROLL TO LEAD ACTION ---
  const scrollToLeadSection = () => {
    leadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTouchedName(true);
    setTouchedPhone(true);
  };

  // --- HANDLE SUBMIT & REDIRECT TO LINE ---
  const handleLineRedirect = () => {
    setTouchedName(true);
    setTouchedPhone(true);

    if (!customerName.trim()) {
      return;
    }
    if (!isPhoneValid) {
      return;
    }

    // จัดข้อความที่ต้องการส่ง (Pre-filled message)
    const typeLabel = 
      houseType === "1-story" ? "บ้านชั้นเดียว" : 
      houseType === "2-story" ? "บ้าน 2 ชั้น" : "บ้าน 3 ชั้น";

    const gradeLabel = 
      materialGrade === "standard" ? "เกรดมาตรฐาน" : 
      materialGrade === "good" ? "เกรดดี" : "พรีเมียม";

    const poolLabel = hasPool ? `มีสระว่ายน้ำ (${poolArea} ตร.ม.)` : "ไม่มี";
    const rangeText = `${calculationResult.minPrice.toLocaleString()} - ${calculationResult.maxPrice.toLocaleString()}`;

    const lineMessage = `สวัสดีครับ สนใจประเมินราคาสร้างบ้านกับ Built D
ชื่อ: ${customerName.trim()}
เบอร์: ${customerPhone.trim()}
ประเภท: ${typeLabel} / เกรด: ${gradeLabel}
พื้นที่ภายใน: ${internalArea} ตร.ม. / กึ่งเปิดโล่ง: ${semiOpenArea} ตร.ม.
สระว่ายน้ำ: ${poolLabel}
ราคาประเมินเบื้องต้น: ${rangeText} บาท
ขอใบประเมินฉบับเต็มและนัดปรึกษาครับ`;

    const encodedMessage = encodeURIComponent(lineMessage);
    
    // ตั้งค่า redirect URL สำหรับ LINE official ของบริษัท
    // รูปแบบ: https://line.me/R/oaMessage/{LINE_ID}/?{message}
    const lineUrl = `https://line.me/R/oaMessage/${CONFIG.LINE_OA_ID}/?${encodedMessage}`;

    // แสดงโมดอลเสร็จสิ้น พร้อมรายละเอียดการ Redirect
    setIsRedirecting(true);
    setShowSuccessModal(true);

    // เปิดหน้าเพจใหม่หลังดีเลย์สั้นๆ เพื่อให้ผู้ใช้เห็นสถานะ
    setTimeout(() => {
      window.open(lineUrl, "_blank");
      setIsRedirecting(false);
    }, 1500);
  };

  // Helper เพื่อจัดฟอร์แมตตัวเลขสกุลเงิน
  const formatCurrency = (val: number) => {
    return val.toLocaleString("th-TH", { style: "decimal", maximumFractionDigits: 0 });
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] selection:bg-[#A8835C] selection:text-white pb-20 relative overflow-hidden">
      
      {/* BACKGROUND DECORATIONS (ตัวเชื่อมโยงดีไซน์แบบ Architectural) */}
      <div className="absolute top-0 left-0 right-0 h-[600px] pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(#2A2A2A 1px, transparent 1px), linear-gradient(90deg, #2A2A2A 1px, transparent 1px)",
        backgroundSize: "60px 60px"
      }}></div>
      <div className="absolute top-[200px] -left-[150px] w-[500px] h-[500px] rounded-full filter blur-[150px] bg-[#A8835C] opacity-[0.04] pointer-events-none"></div>
      <div className="absolute top-[600px] -right-[150px] w-[600px] h-[600px] rounded-full filter blur-[180px] bg-[#1F2D3D] opacity-[0.03] pointer-events-none"></div>

      {/* HEADER SECTION */}
      <header className="border-b border-[#EBE6DC] py-6 px-4 md:px-12 bg-white/70 backdrop-blur-md sticky top-0 z-40 transition-luxury">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Slogan */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="text-3xl font-extrabold tracking-tight text-[#2A2A2A] font-serif relative z-10 block">
                Built <span className="text-[#A8835C]">D</span>
              </span>
              <div className="absolute bottom-1 left-0 w-full h-[3px] bg-[#A8835C]" />
            </div>
            <div className="h-8 w-[1px] bg-[#D4CEBF] hidden sm:block" />
            <div className="text-xs text-gray-500 hidden sm:block tracking-widest font-mono">
              PREMIUM ARCHITECTURAL DRAFT
            </div>
          </div>

          {/* Slogan */}
          <div className="text-right md:text-right">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#A8835C] block mb-0.5">
              ESTIMATOR TOOL
            </span>
            <span className="text-sm font-medium text-gray-600 block">
              ระบบประเมินราคางานก่อสร้างวิศวกรรมสถาปัตยกรรม
            </span>
          </div>
        </div>
      </header>

      {/* BODY CONTENT CONTAINER */}
      <main className="max-w-[1200px] mx-auto px-4 pt-10 relative z-10">
        
        {/* HERO TITLE BLOCK */}
        <div className="text-center md:text-left mb-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F4EFE6] text-[#A8835C] rounded-full text-xs font-semibold tracking-wider uppercase mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Built D Construction Estimator
          </span>
          <h1 className="text-3xl md:text-4xl text-[#2A2A2A] font-serif font-semibold tracking-tight leading-snug mb-3">
            ประเมินราคาสร้างบ้านน็อกดาวน์ & พูลวิลล่าเบื้องต้น
          </h1>
          <p className="text-[#555] text-base leading-relaxed">
            กรอกข้อมูลสเปกบ้านในฝันเพียงไม่กี่ขั้นตอน เพื่อคำนวณงบประมาณคร่าวๆ ได้ทันทีแบบ Real-Time ด้วยฐานข้อมูลราคากลางอัปเดตใหม่ล่าสุด 2569
          </p>
        </div>

        {/* QUICK PRESET SELECTOR BAR */}
        <div className="bg-white/80 border border-[#E6E1D5] hover:border-[#D9D3C5] backdrop-blur-sm rounded-2xl p-4 mb-8 transition-luxury shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-[#A8835C]" />
            <span className="text-sm font-bold text-gray-700">โหลดงบตัวอย่างเพื่อจำลองค่า:</span>
          </div>
          <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
            <button 
              type="button"
              onClick={() => loadPreset("compact")}
              className="flex-1 md:flex-none text-xs bg-[#FAF8F4] hover:bg-[#A8835C]/10 text-gray-700 font-medium py-2 px-3 rounded-lg border border-[#D9D3C3] transition-colors"
            >
              🏡 บ้านชั้นเดี่ยวประหยัด (100 ตร.ม.)
            </button>
            <button 
              type="button"
              onClick={() => loadPreset("family")}
              className="flex-1 md:flex-none text-xs bg-[#FAF8F4] hover:bg-[#A8835C]/10 text-gray-700 font-medium py-2 px-3 rounded-lg border border-[#D9D3C3] transition-colors"
            >
              🏛️ บ้านสองชั้นครอบครัว (255 ตร.ม.)
            </button>
            <button 
              type="button"
              onClick={() => loadPreset("luxury")}
              className="flex-1 md:flex-none text-xs bg-[#FAF8F4] hover:bg-[#A8835C]/10 text-gray-700 font-medium py-2 px-3 rounded-lg border border-[#D9D3C3] transition-colors"
            >
              🏰 พูลวิลล่าหรูพรีเมียม (544 ตร.ม.)
            </button>
          </div>
        </div>

        {/* 2-COLUMN MAIN FLEX GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* =========================================================================
              LEFT COLUMN: FORM FIELDS (ฟอร์มผู้ใช้ปรับแต่งค่า)
              ========================================================================= */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* CARD 1: ประเภทบ้านและจำนวนชั้น */}
            <div className="bg-white rounded-2xl p-6 border border-[#EBE6DC] shadow-xs relative overflow-hidden transition-luxury">
              <div className="flex items-center gap-3 mb-5 border-b border-[#FAF9F6] pb-3">
                <span className="w-7 h-7 rounded-full bg-[#FAF8F4] border border-[#E6E1D5] flex items-center justify-center text-xs font-bold text-[#A8835C] font-mono">01</span>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">ประเภทอาคารและจำนวนชั้น</h3>
                  <p className="text-xs text-gray-400 mt-0.5">เลือกรูปแบบโครงสร้างหลักของบ้าน</p>
                </div>
              </div>

              {/* CARD RADIO GRID */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "1-story", label: "บ้านชั้นเดียว", desc: "พื้นที่แนวราบ คุ้มค่า", icon: Home },
                  { id: "2-story", label: "บ้าน 2 ชั้น", desc: "สัดส่วนครอบครัวยอดนิยม", icon: Layers },
                  { id: "3-story", label: "บ้าน 3 ชั้น", desc: "ใช้พื้นที่แนวตั้งคุ้มค่าสูงสุด", icon: Building },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHouseType(item.id as any)}
                      className={`relative flex flex-col items-center justify-between p-4 rounded-xl text-center border transition-luxury text-sm font-medium ${
                        houseType === item.id 
                          ? "border-[#A8835C] bg-[#FAF8F4] text-[#2A2A2A] shadow-md shadow-amber-900/5"
                          : "border-[#EBE6DC] bg-white text-gray-600 hover:border-[#D1CAC0] hover:bg-[#FAF8F4]/30"
                      }`}
                    >
                      {houseType === item.id && (
                        <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-[#A8835C] text-white">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <Icon className={`w-6 h-6 mb-2.5 ${houseType === item.id ? "text-[#A8835C]" : "text-gray-400"}`} />
                      <div className="font-semibold text-xs sm:text-sm text-gray-800 block">{item.label}</div>
                      <div className="text-[10px] text-gray-400 mt-1 line-clamp-2 md:line-clamp-none">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CARD 2: ระดับเกรดวัสดุ */}
            <div className="bg-white rounded-2xl p-6 border border-[#EBE6DC] shadow-xs transition-luxury">
              <div className="flex items-center gap-3 mb-5 border-b border-[#FAF9F6] pb-3">
                <span className="w-7 h-7 rounded-full bg-[#FAF8F4] border border-[#E6E1D5] flex items-center justify-center text-xs font-bold text-[#A8835C] font-mono">02</span>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">ระดับวัสดุสเปกและการตกแต่ง (วัสดุและเกรดบ้าน)</h3>
                  <p className="text-xs text-gray-400 mt-0.5">ส่งผลต่องานสถาปัตยกรรมภายนอก-ภายใน และคุณภาพวัสดุ</p>
                </div>
              </div>

              {/* STYLISH GRADE SELECTION COMPONENT */}
              <div className="space-y-3">
                {[
                  { 
                    id: "standard", 
                    label: "เกรดมาตรฐาน (Standard Quality)", 
                    price: CONFIG.PRICES.STANDARD, 
                    desc: "เลือกใช้วัสดุแบรนด์ไทยมาตรฐาน แข็งแรงทนทานตามมาตรฐาน มอก., พื้นเซรามิกทั่วไป, สุขภัณฑ์ Cotto/American Standard ระดับเริ่มต้น เน้นดีไซน์เรียบง่ายแต่ทนทาน คุ้มค่าที่สุดสำหรับการเริ่มต้นสร้างครอบครัว"
                  },
                  { 
                    id: "good", 
                    label: "เกรดดี (Premium Standard)", 
                    price: CONFIG.PRICES.GOOD, 
                    desc: "วัสดุเกรดยอดนิยม ทนทานและสวยงามยิ่งขึ้น เช่น พื้น SPC ลายไม้หรูหรา, ประตูกระจกอลูมิเนียมแบรนด์ดี, สุขภัณฑ์ชุดใหญ่ยอดนิยม, งานเฉลียงปูหินคัดพิเศษ ให้ผิวสัมผัสงานเนี้ยบสไตล์มินิมอลโมเตอร์"
                  },
                  { 
                    id: "premium", 
                    label: "ระดับพรีเมียม / ลักชูรี (Architectural Luxury)", 
                    price: CONFIG.PRICES.PREMIUM, 
                    desc: "วัสดุระดับไฮเอนด์และนำเข้าพิเศษ เช่น คอนกรีตขัดผิวสถาปัตยกรรม, หินอ่อนนำเข้าธรรมชาติ, สุขภัณฑ์อัจฉริยะแบรนด์ยุโรป Kohler/Duravit, บานกระจกนิรภัยกรอบซ่อนระดับโรงแรมหรู รองรับแบบดีไซน์พิเศษจากสถาปนิกจัดเต็ม"
                  }
                ].map((grade) => (
                  <button
                    key={grade.id}
                    type="button"
                    onClick={() => setMaterialGrade(grade.id as any)}
                    className={`w-full text-left p-4 rounded-xl border transition-luxury flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                      materialGrade === grade.id 
                        ? "border-[#A8835C] bg-[#FAF8F4] shadow-md shadow-amber-900/5"
                        : "border-[#EBE6DC] bg-white hover:border-[#D1CAC0] hover:bg-[#FAF8F4]/20"
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${materialGrade === grade.id ? "bg-[#A8835C]" : "bg-gray-200"}`} />
                        <span className="font-bold text-gray-800 text-sm md:text-base leading-none">{grade.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 line-clamp-3 md:line-clamp-none pl-5 leading-relaxed">{grade.desc}</p>
                    </div>
                    <div className="text-right flex-shrink-0 pl-5 md:pl-0 mt-2 md:mt-0">
                      <div className="text-xs text-gray-400">อัตราค่าวัสดุเฉลี่ย</div>
                      <div className="text-base font-extrabold text-[#A8835C] font-serif">฿{formatCurrency(grade.price)} <span className="text-[10px] text-gray-400 font-sans font-normal">/ ตร.ม.</span></div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* CARD 3: พื้นที่ใช้สอยภายใน (ตร.ม.) */}
            <div className="bg-white rounded-2xl p-6 border border-[#EBE6DC] shadow-xs transition-luxury">
              <div className="flex items-center gap-3 mb-5 border-b border-[#FAF9F6] pb-3">
                <span className="w-7 h-7 rounded-full bg-[#FAF8F4] border border-[#E6E1D5] flex items-center justify-center text-xs font-bold text-[#A8835C] font-mono">03</span>
                <div className="flex-1 flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-bold text-gray-800 text-base">พื้นที่ใช้สอยภายในอาคาร (ห้องแบบมีผนังเต็ม)</h3>
                    <p className="text-xs text-slate-400 mt-0.5">ห้องปิดล้อมผนัง 4 ด้าน ได้แก่ ห้องนอน ห้องนั่งเล่น ห้องครัว ห้องน้ำ</p>
                  </div>
                  <div className="mt-2 md:mt-0 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="1500"
                      value={internalArea === 0 ? "" : internalArea}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setInternalArea(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      className="w-24 bg-gray-50 border border-gray-200 rounded-lg py-1 px-2 text-right font-bold text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-[#A8835C]"
                    />
                    <span className="text-xs font-semibold text-gray-500">ตร.ม.</span>
                  </div>
                </div>
              </div>

              {/* SLIDER CONTROLLER WITH RANGES DETAILS */}
              <div className="pt-4 pb-2">
                <input
                  type="range"
                  min="20"
                  max="1000"
                  step="10"
                  value={internalArea}
                  onChange={(e) => setInternalArea(parseInt(e.target.value))}
                  className="w-full accent-[#A8835C] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1 px-1">
                  <span>20 ตร.ม. (บ้านเล็ก)</span>
                  <span>150 ตร.ม. (บ้านเดี่ยวทั่วไป)</span>
                  <span>400 ตร.ม. (คฤหาสน์)</span>
                  <span>1,000 ตร.ม.</span>
                </div>
              </div>

              {/* QUICK RECT CONTROLLER BTNS */}
              <div className="flex gap-2 mt-4 justify-end">
                {[100, 150, 250, 400].map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setInternalArea(area)}
                    className="text-[11px] font-semibold bg-[#FAF8F4] text-gray-600 hover:text-[#A8835C] py-1 px-3 rounded border border-gray-200 hover:border-[#A8835C]/50 transition-colors"
                  >
                    {area} ตร.ม.
                  </button>
                ))}
              </div>
            </div>

            {/* CARD 4: พื้นที่กึ่งเปิดโล่ง (ตร.ม.) */}
            <div className="bg-white rounded-2xl p-6 border border-[#EBE6DC] shadow-xs transition-luxury">
              <div className="flex items-center gap-3 mb-5 border-b border-[#FAF9F6] pb-3">
                <span className="w-7 h-7 rounded-full bg-[#FAF8F4] border border-[#E6E1D5] flex items-center justify-center text-xs font-bold text-[#A8835C] font-mono">04</span>
                <div className="flex-1 flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-bold text-gray-800 text-base">พื้นที่กึ่งเปิดโล่งภายนอก (มีหลังคาคลุม)</h3>
                    <p className="text-xs text-slate-400 mt-0.5">ระเบียงภายนอก, ชานพักผ่อน, ที่จอดรถ, ลานซักล้าง (ค่าก่อสร้างคิดเพียง {CONFIG.SEMI_OPEN_FACTOR * 100}% ของราคาหลัก)</p>
                  </div>
                  <div className="mt-2 md:mt-0 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={semiOpenArea === 0 ? "" : semiOpenArea}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setSemiOpenArea(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      className="w-24 bg-gray-50 border border-gray-200 rounded-lg py-1 px-2 text-right font-bold text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-[#A8835C]"
                    />
                    <span className="text-xs font-semibold text-gray-500">ตร.ม.</span>
                  </div>
                </div>
              </div>

              {/* SLIDER CONTROLLER WITH RANGES DETAILS */}
              <div className="pt-4 pb-2">
                <input
                  type="range"
                  min="0"
                  max="400"
                  step="5"
                  value={semiOpenArea}
                  onChange={(e) => setSemiOpenArea(parseInt(e.target.value))}
                  className="w-full accent-[#A8835C] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1 px-1">
                  <span>0 ตร.ม. (ไม่มี)</span>
                  <span>30 ตร.ม. (จอดรถ 2 คัน)</span>
                  <span>100 ตร.ม.</span>
                  <span>400 ตร.ม.</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 justify-end">
                {[0, 20, 45, 80].map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setSemiOpenArea(area)}
                    className="text-[11px] font-semibold bg-[#FAF8F4] text-gray-600 hover:text-[#A8835C] py-1 px-3 rounded border border-gray-200 hover:border-[#A8835C]/50 transition-colors"
                  >
                    {area === 0 ? "ไม่มี" : `${area} ตร.ม.`}
                  </button>
                ))}
              </div>
            </div>

            {/* CARD 5: ตัวเลือกเพิ่มเติม */}
            <div className="bg-white rounded-2xl p-6 border border-[#EBE6DC] shadow-xs transition-luxury">
              <div className="flex items-center gap-3 mb-5 border-b border-[#FAF9F6] pb-3">
                <span className="w-7 h-7 rounded-full bg-[#FAF8F4] border border-[#E6E1D5] flex items-center justify-center text-xs font-bold text-[#A8835C] font-mono">05</span>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">ตัวเลือกสเปกและบริการเสริมพรีเมียม</h3>
                  <p className="text-xs text-gray-400 mt-0.5">ยกระดับบ้านในฝันของคุณด้วยฟิวเจอร์ระดับพัทยาพูลวิลล่า</p>
                </div>
              </div>

              {/* ADDITIONAL SERVICE TOGGLES */}
              <div className="space-y-4">
                
                {/* 1. สระว่ายน้ำระบบเกลือหมุนวน */}
                <div className="border border-[#EBE6DC] rounded-xl p-4 transition-all">
                  <label className="flex items-start md:items-center justify-between gap-3 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5 md:pt-0">
                        <input
                          type="checkbox"
                          checked={hasPool}
                          onChange={(e) => setHasPool(e.target.checked)}
                          className="w-5 h-5 rounded accent-[#A8835C] cursor-pointer"
                        />
                      </div>
                      <div>
                        <span className="font-bold text-gray-800 text-sm md:text-base flex items-center gap-2">
                          <Waves className="w-4 h-4 text-blue-500" />
                          เพิ่มสระว่ายน้ำส่วนตัว (Private Pool Salt-System)
                        </span>
                        <p className="text-xs text-gray-400 mt-1">สระว่ายน้ำโครงสร้างคอนกรีตระบบน้ำล้น สระเกลือรื่นรมย์ (฿{formatCurrency(CONFIG.POOL_PRICE_PER_SQM)} / ตร.ม.)</p>
                      </div>
                    </div>
                  </label>

                  {/* POOL SIZE FIELDS PANEL */}
                  <AnimatePresence>
                    {hasPool && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-dashed border-[#FAF9F6] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#FAF8F5] p-3 rounded-lg">
                          <div className="text-xs text-gray-600 font-medium">ระบุขนาดสระว่ายน้ำส่วนตัว:</div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="6"
                              max="300"
                              value={poolArea}
                              onChange={(e) => setPoolArea(Math.max(1, parseInt(e.target.value) || 0))}
                              className="w-20 bg-white border border-gray-200 rounded-md py-1 px-2 text-right font-bold text-gray-800 font-mono"
                            />
                            <span className="text-xs text-gray-500 font-medium">ตารางเมตร (ตร.ม.)</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2.5 justify-end">
                          {[18, 32, 50].map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => setPoolArea(size)}
                              className="text-[11px] font-medium bg-white hover:bg-gray-100 text-gray-600 py-1 px-2.5 rounded border border-gray-200"
                            >
                              {size === 18 ? "3x6 ม." : size === 32 ? "4x8 ม." : "5x10 ม."} ({size} ตร.ม.)
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. บริการออกแบบเขียนแบบสถาปัตยกรรม */}
                <div className="border border-[#EBE6DC] rounded-xl p-4 transition-all">
                  <label className="flex items-start md:items-center justify-between gap-3 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5 md:pt-0">
                        <input
                          type="checkbox"
                          checked={wantsDesignService}
                          onChange={(e) => setWantsDesignService(e.target.checked)}
                          className="w-5 h-5 rounded accent-[#A8835C] cursor-pointer"
                        />
                      </div>
                      <div>
                        <span className="font-bold text-gray-800 text-sm md:text-base flex items-center gap-2">
                          <CompassIcon />
                          บริการออกแบบและเขียนแบบโดยสถาปนิกมืออาชีพ
                        </span>
                        <p className="text-xs text-gray-400 mt-1">
                          ออกแบบแปลน 3D ทัศนียภาพ และชุดดรออิ้งสแตนดาร์ดวิศวกรโครงสร้างเซ็นรับรอง (คิดแบบขั้นบันไดมาตรฐานสมาคมสถาปนิกสยามเริ่มต้น 7.5%)
                        </p>
                      </div>
                    </div>
                  </label>
                </div>

              </div>
            </div>

          </div>

          {/* =========================================================================
              RIGHT COLUMN: REAL-TIME CALCULATION BILL & LEAD FORM (การ์ดสรุปราคา)
              ========================================================================= */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
            
            {/* STICKY MAIN ESTIMATE CARD */}
            <div className="bg-[#1F2D3D] text-[#FAF8F4] rounded-2xl shadow-xl border border-gray-800 p-6 relative overflow-hidden">
              
              {/* Card top architectural print style */}
              <div className="absolute top-0 right-0 p-4 font-mono text-[10px] text-gray-500 tracking-widest hidden sm:block">
                BUILT-D REV. 2026
              </div>

              <div className="flex items-center gap-2 text-[#A8835C] mb-4">
                <Calculator className="w-5 h-5" />
                <span className="text-xs font-bold tracking-wider uppercase font-mono">Live Cost Valuation Card</span>
              </div>

              <h2 className="text-xl font-serif font-semibold text-white tracking-wide border-b border-gray-800 pb-3 mb-4">
                สรุปราคาก่อสร้างโดยประมาณ
              </h2>

              {/* DETAILED LEDGER TABLE */}
              <div className="space-y-3.5 mb-6 text-sm text-gray-300">
                
                {/* 1. งานก่อสร้างภายใน */}
                <div className="flex justify-between items-center bg-gray-900/30 p-2 rounded">
                  <div>
                    <span className="block text-xs font-semibold text-gray-400">01. งานก่อสร้างโครงสร้างภายใน</span>
                    <span className="text-[11px] text-gray-400 font-normal">
                      {internalArea} ตร.ม. × ฿{formatCurrency(calculationResult.basePricePerSqm)}
                    </span>
                  </div>
                  <span className="font-semibold text-white text-right">
                    ฿{formatCurrency(calculationResult.internalCost)}
                  </span>
                </div>

                {/* 2. งานกึ่งเปิดโล่ง */}
                {semiOpenArea > 0 && (
                  <div className="flex justify-between items-center bg-gray-900/30 p-2 rounded">
                    <div>
                      <span className="block text-xs font-semibold text-gray-400">02. งานระเบียงเฉลียงหลังคาคลุม</span>
                      <span className="text-[11px] text-gray-400 font-normal">
                        {semiOpenArea} ตร.ม. × ฿{formatCurrency(calculationResult.semiOpenPricePerSqm)}
                      </span>
                    </div>
                    <span className="font-semibold text-white text-right">
                      ฿{formatCurrency(calculationResult.semiOpenCost)}
                    </span>
                  </div>
                )}

                {/* 3. งานสระว่ายน้ำ */}
                {hasPool && poolArea > 0 && (
                  <div className="flex justify-between items-center bg-gray-900/30 p-2 rounded">
                    <div>
                      <span className="block text-xs font-semibold text-gray-400">03. สระว่ายน้ำคอนกรีตภายนอก</span>
                      <span className="text-[11px] text-gray-400 font-normal">
                        {poolArea} ตร.ม. × ฿{formatCurrency(CONFIG.POOL_PRICE_PER_SQM)}
                      </span>
                    </div>
                    <span className="font-semibold text-white text-right">
                      ฿{formatCurrency(calculationResult.poolCost)}
                    </span>
                  </div>
                )}

                {/* 4. ค่าบริการออกแบบเขียนแบบ (ถ้าติ๊ก) */}
                {wantsDesignService && calculationResult.designFee > 0 && (
                  <div className="flex justify-between items-center bg-gray-900/30 p-2 rounded">
                    <div>
                      <span className="block text-xs font-semibold text-gray-400 flex items-center gap-1">
                        04. ค่าออกแบบสถาปัตยกรรมสากล
                        <span className="text-[10px] text-[#A8835C] font-mono font-bold">(ASA)</span>
                      </span>
                      <span className="text-[11px] text-gray-400 font-normal underline decoration-indigo-400/40 cursor-help" title="อัตราขั้นบันได 7.5% - 4.25%">
                        คำนวณแบบขั้นบันไดสะสม
                      </span>
                    </div>
                    <span className="font-semibold text-[#A8835C] text-right">
                      ฿{formatCurrency(calculationResult.designFee)}
                    </span>
                  </div>
                )}

                {/* LINE SPLITTER */}
                <div className="border-t border-gray-800" />

                {/* 5. รวมงบงานก่อสร้างและออกแบบก่อนแวต */}
                <div className="flex justify-between text-xs text-gray-400">
                  <span>ยอดประมาณก่อนคิดภาษีมูลค่าเพิ่ม:</span>
                  <span className="font-semibold text-gray-200">฿{formatCurrency(calculationResult.totalBeforeVat)}</span>
                </div>

                {/* 6. แวต 7% */}
                <div className="flex justify-between text-xs text-gray-400">
                  <span>ภาษีมูลค่าเพิ่ม (VAT {CONFIG.VAT_RATE * 100}%):</span>
                  <span className="font-semibold text-gray-200">฿{formatCurrency(calculationResult.vatValue)}</span>
                </div>

              </div>

              {/* HIGHLIGHTED TOTAL PRICE RANGE PANEL */}
              <div className="bg-[#2A2A2A]/50 border border-gray-800 hover:border-gray-700 rounded-xl p-4 text-center transition-all">
                <span className="text-[11px] uppercase tracking-wider text-[#A8835C] font-semibold block mb-1">
                  ช่วงราคาประเมินงบประมาณสุทธิโดยสังเขป (±10%)
                </span>
                
                {/* BIG PROMINENT PRICE BANNER */}
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-serif block my-1">
                  ฿{formatCurrency(calculationResult.minPrice)} - ฿{formatCurrency(calculationResult.maxPrice)}
                </span>

                <div className="text-[11px] text-gray-400 mt-2 flex items-center justify-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  ราคากลางประเมินเฉลี่ย: ฿{formatCurrency(calculationResult.totalWithVat)} (รวม VAT แล้ว)
                </div>
              </div>

              {/* EXPLAINER DISCLAIMER SUB CARD */}
              <p className="text-[11px] text-gray-400 font-light mt-4 leading-relaxed leading-normal text-justify">
                * ราคานี้เป็นการประเมินราคาก่อสร้างเบื้องต้นทางสถิติเพื่อใช้ในการบริหารตั้งงบประมาณโครงการเบื้องต้นเท่านั้น 
                ราคาก่อสร้างและตกแต่งจริงขึ้นงานจริงอาจแตกต่างตามประเภทดินสแตนบาย วัสดุที่เจ้าของบ้านเจาะจง 
                และรายละเอียดรายการจัดทำบัญชีแสดงปริมาณวัสดุและราคาผู้รับเหมาจริง (BOQ) โดยสถาปนิกและทีมวิศวกรรังวัดของ Built D
              </p>

              {/* QUICK JUMP DIRECT BUTTON */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={scrollToLeadSection}
                  className="w-full flex items-center justify-center gap-2 bg-[#A8835C] hover:bg-[#96724E] text-white text-xs font-bold uppercase tracking-wider py-3.5 px-4 rounded-xl transition-luxury shadow-md hover:translate-y-[-1px]"
                >
                  <MessageSquare className="w-4 h-4" />
                  แอดไลน์รับใบประเมินและคิวท์ราคารายละเอียด BOQ ฟรี
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

            {/* =========================================================================
                LEAD FORM: CUSTOMER INFORMATION SYSTEM
                ========================================================================= */}
            <div 
              ref={leadSectionRef}
              className="bg-white rounded-2xl border border-[#EBE6DC] shadow-sm p-6 space-y-5 transition-luxury active:border-[#A8835C]"
            >
              <div className="border-b border-[#FAF9F6] pb-3">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold">EXCELLENT LEAD LOCK</span>
                </div>
                <h3 className="font-bold text-gray-800 text-base mt-2 flex items-center gap-1.5">
                  ปรึกษาสถาปนิกและรับราคาประเมินอย่างละเอียด
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  กรอกชื่อของคุณและเบอร์โทรศัพท์ติดต่อ เพื่อยืนยันตัวตนแอดไลน์บริษัท Built D รับใบประเมินฉบับสมบูรณ์ฟรี!
                </p>
              </div>

              <div className="space-y-4">
                
                {/* 1. INPUT CUSTOMER NAME */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">
                    ชื่อ-นามสกุล ของท่าน <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="เช่น คุณกานต์ พิชญเมธา"
                      value={customerName}
                      onBlur={() => setTouchedName(true)}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={`w-full bg-[#FAF8F5] border rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#A8835C] ${
                        touchedName && !customerName.trim() 
                          ? "border-red-400 focus:ring-red-400 bg-red-50/20" 
                          : "border-[#E1DACB]"
                      }`}
                    />
                  </div>
                  {touchedName && !customerName.trim() && (
                    <span className="text-[10px] text-red-500 mt-1 block">กรุณากรอกชื่อและนามสกุลของคุณเพื่อดำเนินการต่อ</span>
                  )}
                </div>

                {/* 2. INPUT CUSTOMER PHONE */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">
                    เบอร์โทรศัพท์ติดต่อ <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      required
                      placeholder="เช่น 0812345678"
                      value={customerPhone}
                      onBlur={() => setTouchedPhone(true)}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, ""))}
                      className={`w-full bg-[#FAF8F5] border rounded-xl py-3 pl-10 pr-4 text-sm font-medium font-mono focus:outline-none focus:ring-1 focus:ring-[#A8835C] ${
                        touchedPhone && !isPhoneValid 
                          ? "border-red-400 focus:ring-red-400 bg-red-50/20" 
                          : "border-[#E1DACB]"
                      }`}
                    />
                  </div>
                  {touchedPhone && !isPhoneValid && (
                    <span className="text-[10px] text-red-500 mt-1 block">กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้องและครบถ้วน (ตัวเลข 9-10 หลัก)</span>
                  )}
                </div>

              </div>

              {/* BIG LINE BUTTON */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleLineRedirect}
                  disabled={isRedirecting}
                  className={`w-full flex items-center justify-center gap-2.5 transition-luxury py-4 px-6 rounded-xl font-bold text-sm tracking-wide shadow-md ${
                    isFormValid 
                      ? "bg-[#06C755] hover:bg-[#05B34C] text-white hover:translate-y-[-1px] cursor-pointer" 
                      : "bg-[#06C755]/40 text-white/80 cursor-not-allowed"
                  }`}
                >
                  <MessageSquare className="w-5 h-5 flex-shrink-0" />
                  {isRedirecting ? "กำลังกำลังเชื่อมข้อมูล..." : "ส่งข้อมูลเพื่อเพิ่มเพื่อนคุยกับสถาปนิก Built D"}
                  <ExternalLink className="w-4 h-4 flex-shrink-0 opacity-80" />
                </button>
                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400 mt-2.5 font-medium">
                  <Lock className="w-3 h-3 text-slate-300" />
                  ข้อมูลของคุณจะได้รับการปกป้องภายใต้ข้อปฎิบัติ PDPA บริษัท Built D จำกัด
                </div>
              </div>

              {/* CLEAR & NEW ASSESS TOOL */}
              <div className="pt-2 border-t border-gray-100 flex justify-center">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#A8835C] font-semibold transition-colors py-1.5 px-3 rounded-lg hover:bg-[#FAF8F4]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  ล้างค่าเพื่อเริ่มต้นคำนวณใหม่
                </button>
              </div>

            </div>

          </div>

        </div>

      </main>

      {/* FOOTER METRICS INFO */}
      <footer className="mt-20 border-t border-[#EBE6DC] bg-[#FAF8F4] py-8 text-center text-xs text-gray-500">
        <div className="max-w-[1200px] mx-auto px-4">
          <p className="font-serif font-bold text-[#2A2A2A] text-lg mb-1 tracking-wide">Built <span className="text-[#A8835C]">D</span></p>
          <p className="text-[#A8835C] font-mono tracking-widest text-[10px] mb-3">CONSTRUCTION & INTERIOR CO., LTD</p>
          <p className="max-w-md mx-auto leading-relaxed">
            อาคารศุภมงคลดีแลนด์ แผนกวิจัยและการเขียนระบายสีสเกตช์สถาปัตยกรรม 
            กรดประเมินผลตามอัตรามาตรฐานอ้างอิงล่าสุด. ลิขสิทธิ์ถูกต้องทั้งหมด © 2026.
          </p>
        </div>
      </footer>

      {/* SUCCESS & LINE CONTEXT REDIRECT MODAL DIALOG */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-[#D1CAC0] p-6 max-w-md w-full shadow-2xl relative"
            >
              <div className="text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-[#06C755] border border-emerald-100">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                
                <h3 className="text-lg font-bold text-gray-800">
                  บันทึกข้อมูลเตรียมส่ง LINE สำเร็จ!
                </h3>
                
                <p className="text-xs text-gray-500 leading-relaxed">
                  เรากำลังดำเนินการพาคุณไปยังแอปพลิเคชัน LINE เพื่อทำการแอดไลน์คุยกับเซลล์พร้อมแนบข้อมูลใบเสนอราคาเบื้องต้นนี้ไปหาฝ่ายบริการของทีมงาน <span className="font-semibold text-gray-700">Built D</span> โดยตรง
                </p>

                {/* SHOWING MESSAGE PREVIEW BOX */}
                <div className="bg-[#FAF8F4] text-left p-3.5 rounded-xl border border-[#E6E1D5] text-xs font-mono text-gray-600 block mt-2 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  <span className="block text-[10px] font-semibold text-[#A8835C] font-sans mb-1.5">ตัวอย่างข้อความพรีฟิลล์ที่เตรียมคุยกับทีมงาน:</span>
                  {`สวัสดีครับ สนใจประเมินราคาสร้างบ้านกับ Built D\nชื่อ: ${customerName}\nเบอร์: ${customerPhone}\nประเภท: ${houseType === "1-story" ? "บ้านชั้นเดียว" : houseType === "2-story" ? "บ้าน 2 ชั้น" : "บ้าน 3 ชั้น"}\nพื้นที่ภายใน: ${internalArea} ตร.ม.\nงบประเมิน: ${calculationResult.minPrice.toLocaleString()} - ${calculationResult.maxPrice.toLocaleString()} บาท`}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      // เปิดแอดไลน์ซ้ำกรณีเบราว์เซอร์ผู้ใช้บล็อกป๊อปอัพ
                      const typeLabel = houseType === "1-story" ? "บ้านชั้นเดียว" : houseType === "2-story" ? "บ้าน 2 ชั้น" : "บ้าน 3 ชั้น";
                      const gradeLabel = materialGrade === "standard" ? "เกรดมาตรฐาน" : materialGrade === "good" ? "เกรดดี" : "พรีเมียม";
                      const poolLabel = hasPool ? `มีสระว่ายน้ำ (${poolArea} ตร.ม.)` : "ไม่มี";
                      const lineMessage = `สวัสดีครับ สนใจประเมินราคาสร้างบ้านกับ Built D\nชื่อ: ${customerName}\nเบอร์: ${customerPhone}\nประเภท: ${typeLabel} / เกรด: ${gradeLabel}\nพื้นที่ภายใน: ${internalArea} ตร.ม. / กึ่งเปิดโล่ง: ${semiOpenArea} ตร.ม.\nสระว่ายน้ำ: ${poolLabel}\nราคาประเมินเบื้องต้น: ${calculationResult.minPrice.toLocaleString()} - ${calculationResult.maxPrice.toLocaleString()} บาท\nขอใบประเมินฉบับเต็มและนัดปรึกษาครับ`;
                      const lineUrl = `https://line.me/R/oaMessage/${CONFIG.LINE_OA_ID}/?${encodeURIComponent(lineMessage)}`;
                      window.open(lineUrl, "_blank");
                    }}
                    className="w-full bg-[#06C755] hover:bg-[#05B34C] text-white rounded-xl py-3 text-xs font-bold transition-all flex items-center justify-center gap-1"
                  >
                    ถ้าเบราว์เซอร์ไม่เปิด LINE ให้อัตโนมัติ คลิกที่นี่เพื่อไปคุยแชต
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowSuccessModal(false)}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 font-bold underline mt-3.5"
                  >
                    ปิดย้อนกลับไปหน้าประเมิน
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Custom simple compass icon
function CompassIcon() {
  return (
    <svg 
      className="w-4 h-4 text-[#A8835C] mt-0.5" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
