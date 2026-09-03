import { ComponentType } from 'react';
import {
  Apple, Milk, Wheat, Beef, Carrot, Cookie, Snowflake,
  ShoppingBasket, Sandwich, Wine, Croissant, Fish,
  Nut, ShoppingCart, Pencil, Shirt,
} from 'lucide-react-native';
import { GroceryItem } from '@/store/groceryStore';

// ─── Category suggestions ─────────────────────────────────────────────────────

// Supplies/Clothing added alongside Groceries' existing categories —
// parse-grocery-receipt (receipt scanning) and kroger-prices (price
// estimation) both now recognize these too, since a Target/Walmart
// receipt commonly mixes groceries with school supplies or clothing.
export const CATEGORIES = ['Produce', 'Dairy', 'Grains', 'Spices', 'Meat', 'Snacks', 'Beverages', 'Frozen', 'Cleaning', 'Personal Care', 'Bakery', 'Seafood', 'Deli', 'Frozen Meals', 'Supplies', 'Clothing', 'Other'];
export const CAT_ICON: Record<string, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Produce:        Carrot,
  Dairy:          Milk,
  Grains:         Wheat,
  Spices:         Apple,       // closest available; spice jar not in lucide
  Meat:           Beef,
  Snacks:         Cookie,
  Beverages:      Wine,
  Frozen:         Snowflake,
  Cleaning:       ShoppingBasket,
  'Personal Care': Nut,
  Bakery:         Croissant,
  Seafood:        Fish,
  Deli:           Sandwich,
  'Frozen Meals': Snowflake,
  Supplies:       Pencil,
  Clothing:       Shirt,
  Other:          ShoppingCart,
};
export const CAT_EMOJI: Record<string, string> = {
  Produce: '🥦', Dairy: '🥛', Grains: '🌾', Spices: '🌶️', Meat: '🥩',
  Snacks: '🍿', Beverages: '🧃', Frozen: '🧊', Cleaning: '🧹', 'Personal Care': '🧴',
  Bakery: '🥐', Seafood: '🐟', Deli: '🥪', 'Frozen Meals': '🧊',
  Supplies: '📚', Clothing: '👕', Other: '📦',
};

export function CatIcon({ category, size = 20, color }: { category?: string; size?: number; color?: string }) {
  const Ic = CAT_ICON[category ?? 'Other'] ?? ShoppingCart;
  return <Ic size={size} color={color} strokeWidth={1.8} />;
}

// ─── Per-item emoji lookup ──────────────────────────────────────────────────
// ItemCard only ever showed ONE icon per CATEGORY (all of Produce got the
// same carrot glyph, so "diced onion"/"chopped spinach"/"diced bell pepper"
// were visually indistinguishable) — live-requested: a real per-item icon,
// like a meal-plan ingredient list shows. Keyword-matched against the item
// NAME (same style as categorizeItem() in features/vault/tabs/meals/types.ts,
// which already does this for category assignment) rather than an AI call
// per item — instant, free, works offline, and covers the vast majority of
// real grocery/household items without network latency on every add.
//
// Ordered most-specific-first: "bell pepper" must be checked before a bare
// "pepper" entry would exist (it doesn't, here, but the general rule holds
// for any future additions) so a qualified name doesn't fall through to a
// less specific match purely on match order. Each entry's regex uses \b
// word boundaries so "onion" doesn't also match inside an unrelated longer
// word.
const ITEM_EMOJI_RULES: { pattern: RegExp; emoji: string }[] = [
  // Produce
  { pattern: /\bbell\s*pepper/, emoji: '🫑' },
  { pattern: /\bjalapeno|\bjalapeño/, emoji: '🌶️' },
  // Black/white peppercorn is a spice, not a fresh chili/bell pepper —
  // must be checked before the generic \bpepper\b fallback below.
  { pattern: /\bblack\s*pepper|\bwhite\s*pepper|\bpeppercorn/, emoji: '⚫' },
  { pattern: /\bpepper\b/, emoji: '🌶️' },
  { pattern: /\bonion/, emoji: '🧅' },
  { pattern: /\bgarlic/, emoji: '🧄' },
  { pattern: /\bspinach/, emoji: '🥬' },
  { pattern: /\blettuce/, emoji: '🥬' },
  { pattern: /\bkale\b/, emoji: '🥬' },
  { pattern: /\bcabbage/, emoji: '🥬' },
  { pattern: /\bcarrot/, emoji: '🥕' },
  { pattern: /\bpotato/, emoji: '🥔' },
  { pattern: /\bsweet\s*potato|\byam\b/, emoji: '🍠' },
  { pattern: /\btomato/, emoji: '🍅' },
  { pattern: /\bcucumber/, emoji: '🥒' },
  { pattern: /\bzucchini|\bcourgette/, emoji: '🥒' },
  { pattern: /\bbroccoli/, emoji: '🥦' },
  { pattern: /\bcauliflower/, emoji: '🥦' },
  { pattern: /\bcorn\b/, emoji: '🌽' },
  { pattern: /\bmushroom/, emoji: '🍄' },
  { pattern: /\beggplant|\baubergine/, emoji: '🍆' },
  { pattern: /\bavocado/, emoji: '🥑' },
  { pattern: /\bginger/, emoji: '🫚' },
  { pattern: /\bcelery/, emoji: '🥬' },
  { pattern: /\bbanana/, emoji: '🍌' },
  { pattern: /\bapple\b/, emoji: '🍎' },
  { pattern: /\borange\b/, emoji: '🍊' },
  { pattern: /\blemon/, emoji: '🍋' },
  { pattern: /\blime\b/, emoji: '🍋' },
  { pattern: /\bgrape/, emoji: '🍇' },
  { pattern: /\bstrawberr/, emoji: '🍓' },
  { pattern: /\bblueberr/, emoji: '🫐' },
  { pattern: /\bwatermelon/, emoji: '🍉' },
  { pattern: /\bmelon/, emoji: '🍈' },
  { pattern: /\bpineapple/, emoji: '🍍' },
  { pattern: /\bmango/, emoji: '🥭' },
  { pattern: /\bpeach/, emoji: '🍑' },
  { pattern: /\bpear\b/, emoji: '🍐' },
  { pattern: /\bcherry|\bcherries/, emoji: '🍒' },
  { pattern: /\bcilantro|\bparsley|\bbasil|\bherbs?\b/, emoji: '🌿' },
  // Dairy
  { pattern: /\bmilk\b/, emoji: '🥛' },
  { pattern: /\bcheese|\bcheddar|\bparmesan|\bmozzarella/, emoji: '🧀' },
  { pattern: /\byogurt|\byoghurt/, emoji: '🥣' },
  { pattern: /\bbutter\b/, emoji: '🧈' },
  { pattern: /\begg\b|\beggs\b/, emoji: '🥚' },
  { pattern: /\bcream\b/, emoji: '🍦' },
  // Meat / seafood
  { pattern: /\bchicken/, emoji: '🍗' },
  { pattern: /\bturkey/, emoji: '🦃' },
  { pattern: /\bbeef|\bsteak/, emoji: '🥩' },
  { pattern: /\bpork|\bbacon|\bham\b|\bsausage/, emoji: '🥓' },
  { pattern: /\blamb/, emoji: '🍖' },
  { pattern: /\bshrimp|\bprawn/, emoji: '🍤' },
  { pattern: /\bsalmon|\bfish\b|\btuna\b/, emoji: '🐟' },
  { pattern: /\bcrab\b/, emoji: '🦀' },
  // Grains / bakery
  { pattern: /\brice\b/, emoji: '🍚' },
  { pattern: /\bpasta|\bnoodle|\bspaghetti|\bmacaroni/, emoji: '🍝' },
  { pattern: /\bbread\b/, emoji: '🍞' },
  { pattern: /\bbagel/, emoji: '🥯' },
  { pattern: /\bcroissant/, emoji: '🥐' },
  { pattern: /\btortilla/, emoji: '🫓' },
  { pattern: /\bcereal/, emoji: '🥣' },
  { pattern: /\boat/, emoji: '🌾' },
  { pattern: /\bflour\b/, emoji: '🌾' },
  { pattern: /\bquinoa/, emoji: '🌾' },
  { pattern: /\bbarley/, emoji: '🌾' },
  { pattern: /\bcornmeal|\bpolenta/, emoji: '🌽' },
  // Baking
  { pattern: /\bcake\b/, emoji: '🎂' },
  { pattern: /\bcupcake|\bmuffin/, emoji: '🧁' },
  { pattern: /\bpie\b/, emoji: '🥧' },
  { pattern: /\bbaking\s*soda/, emoji: '🧁' },
  { pattern: /\bbaking\s*powder/, emoji: '🧁' },
  { pattern: /\byeast\b/, emoji: '🍞' },
  { pattern: /\bvanilla\b/, emoji: '🧁' },
  { pattern: /\bcocoa\b|\bcocoa\s*powder/, emoji: '🍫' },
  { pattern: /\bfrosting|\bicing\b/, emoji: '🧁' },
  { pattern: /\bsprinkle[s]?\b/, emoji: '🧁' },
  { pattern: /\bcake\s*mix|\bbrownie\s*mix|\bpancake\s*mix/, emoji: '🧁' },
  { pattern: /\bbaking\s*sheet|\bcake\s*pan|\bmuffin\s*tin/, emoji: '🧁' },
  { pattern: /\bcupcake\s*liner|\bmuffin\s*liner/, emoji: '🧁' },
  { pattern: /\bfood\s*coloring/, emoji: '🎨' },
  { pattern: /\bcorn\s*starch|\bcornstarch/, emoji: '🌽' },
  { pattern: /\bcondensed\s*milk|\bevaporated\s*milk/, emoji: '🥛' },
  { pattern: /\bmarshmallow/, emoji: '🍬' },
  // Pulses / legumes / grains staples
  { pattern: /\blentil/, emoji: '🫘' },
  { pattern: /\bchickpea|\bgarbanzo/, emoji: '🫘' },
  // Coffee beans checked before the generic \bbean[s]?\b fallback below,
  // which would otherwise catch them first.
  { pattern: /\bcoffee\s*bean/, emoji: '☕' },
  { pattern: /\bblack\s*bean|\bkidney\s*bean|\bpinto\s*bean|\bbean[s]?\b/, emoji: '🫘' },
  { pattern: /\bsplit\s*pea|\bdal\b|\bdaal\b|\btoor\b|\barhar\b|\bmoong\b|\bmung\b|\burad\b|\bmasoor\b|\bchana\b(?!\s*masala)|\brajma\b/, emoji: '🫘' },
  { pattern: /\bpea[s]?\b/, emoji: '🟢' },
  { pattern: /\bsoy\s*bean|\bedamame/, emoji: '🫘' },
  // Spices / condiments
  { pattern: /\bsalt\b/, emoji: '🧂' },
  { pattern: /\bsugar\b/, emoji: '🧂' },
  // Oils — most specific type first so e.g. "coconut oil" doesn't fall
  // through to the generic bottle emoji before its own rule is checked.
  { pattern: /\bolive\s*oil/, emoji: '🫒' },
  { pattern: /\bcoconut\s*oil/, emoji: '🥥' },
  { pattern: /\bsesame\s*oil/, emoji: '🫙' },
  { pattern: /\bmustard\s*oil/, emoji: '🫙' },
  { pattern: /\bsunflower\s*oil|\bvegetable\s*oil|\bcanola\s*oil|\bpeanut\s*oil|\bgroundnut\s*oil/, emoji: '🫙' },
  { pattern: /\bghee\b|\bclarified\s*butter/, emoji: '🧈' },
  // Non-cooking oils must be checked before the generic \boil\b fallback
  // right below, which would otherwise catch them first.
  { pattern: /\bmotor\s*oil|\bengine\s*oil/, emoji: '🛢️' },
  { pattern: /\bcooking\s*oil|\boil\b/, emoji: '🫙' },
  { pattern: /\bvinegar/, emoji: '🫙' },
  { pattern: /\bhoney/, emoji: '🍯' },
  // Sauces & condiments
  { pattern: /\bketchup/, emoji: '🍅' },
  { pattern: /\bmustard\b/, emoji: '🫙' },
  { pattern: /\bmayo(?:nnaise)?\b/, emoji: '🥚' },
  { pattern: /\bsoy\s*sauce/, emoji: '🍶' },
  { pattern: /\bhot\s*sauce|\bsriracha|\bsalsa\b/, emoji: '🌶️' },
  { pattern: /\bbbq\s*sauce|\bbarbecue\s*sauce/, emoji: '🍖' },
  { pattern: /\bpasta\s*sauce|\bmarinara|\bpizza\s*sauce/, emoji: '🍅' },
  { pattern: /\bworcestershire/, emoji: '🍶' },
  { pattern: /\bpesto\b/, emoji: '🌿' },
  { pattern: /\btahini\b/, emoji: '🫘' },
  { pattern: /\bhummus\b/, emoji: '🫘' },
  { pattern: /\bsalad\s*dressing|\bdressing\b/, emoji: '🥗' },
  { pattern: /\bjam\b|\bjelly\b|\bpreserve[s]?\b/, emoji: '🍓' },
  { pattern: /\bpeanut\s*butter/, emoji: '🥜' },
  { pattern: /\bnutella/, emoji: '🍫' },
  { pattern: /\bsauce\b/, emoji: '🍯' },
  // Spices
  { pattern: /\bcumin/, emoji: '🌿' },
  { pattern: /\bturmeric/, emoji: '🌿' },
  { pattern: /\bcoriander/, emoji: '🌿' },
  { pattern: /\bcinnamon/, emoji: '🌿' },
  { pattern: /\bpaprika/, emoji: '🌶️' },
  { pattern: /\bcayenne/, emoji: '🌶️' },
  { pattern: /\bchili\s*powder|\bchilli\s*powder/, emoji: '🌶️' },
  { pattern: /\bgaram\s*masala|\bcurry\s*powder|\bmasala\b|\bspice\s*mix/, emoji: '🌿' },
  { pattern: /\bnutmeg|\bclove[s]?\b|\bcardamom|\bbay\s*leaf|\bbay\s*leaves|\boregano|\bthyme|\brosemary|\bsage\b/, emoji: '🌿' },
  // Beverages
  { pattern: /\bwater\b/, emoji: '💧' },
  { pattern: /\bcoffee\s*filter/, emoji: '☕' },
  { pattern: /\bcoffee\s*bean|\bground\s*coffee|\binstant\s*coffee|\bcoffee\s*pod|\bespresso|\bcoffee\b/, emoji: '☕' },
  { pattern: /\bcreamer\b/, emoji: '☕' },
  { pattern: /\bgreen\s*tea|\bblack\s*tea|\bherbal\s*tea|\bchamomile|\bearl\s*grey|\bchai\b|\btea\s*bag|\btea\b/, emoji: '🍵' },
  { pattern: /\bjuice/, emoji: '🧃' },
  { pattern: /\bsoda|\bcola\b/, emoji: '🥤' },
  { pattern: /\bwine\b/, emoji: '🍷' },
  { pattern: /\bbeer\b/, emoji: '🍺' },
  // Frozen
  { pattern: /\bice\s*cream/, emoji: '🍦' },
  { pattern: /\bfrozen\s*pizza|\bpizza\b/, emoji: '🍕' },
  { pattern: /\bfrozen\s*meal|\bfrozen\s*dinner|\btv\s*dinner/, emoji: '🧊' },
  { pattern: /\bfrozen\s*vegetable|\bfrozen\s*veggie/, emoji: '🧊' },
  { pattern: /\bfrozen\s*fruit/, emoji: '🧊' },
  { pattern: /\bwaffle/, emoji: '🧇' },
  { pattern: /\bpopsicle|\bice\s*pop/, emoji: '🍦' },
  { pattern: /\bfish\s*stick/, emoji: '🐟' },
  { pattern: /\bchicken\s*nugget/, emoji: '🍗' },
  { pattern: /\bfrozen\b/, emoji: '🧊' },
  // Snacks
  { pattern: /\bcookie/, emoji: '🍪' },
  { pattern: /\bchip[s]?\b/, emoji: '🍿' },
  { pattern: /\bchocolate/, emoji: '🍫' },
  { pattern: /\bcandy/, emoji: '🍬' },
  { pattern: /\bnut[s]?\b|\balmond|\bpeanut|\bcashew/, emoji: '🥜' },
  // Cleaning & laundry — the paper-qualified entries here (toilet paper,
  // paper towel, paper plate/cup/bowl) must come BEFORE the generic
  // office-supplies "paper" rule below, since rules are checked in order
  // and the first match wins; without this "toilet paper" would match
  // the bare 📄 rule first and never reach its own more specific one.
  { pattern: /\btoilet\s*paper|\bpaper\s*towel/, emoji: '🧻' },
  { pattern: /\bpaper\s*plate|\bpaper\s*cup|\bpaper\s*bowl/, emoji: '🍽️' },
  { pattern: /\bsoap\b|\bhand\s*soap|\bdish\s*soap/, emoji: '🧼' },
  { pattern: /\bnapkin\s*ring/, emoji: '🍽️' },
  { pattern: /\btissue|\bnapkin/, emoji: '🧻' },
  // Dishwasher — checked before the generic \bdetergent\b fallback in the
  // Laundry section below, which would otherwise catch "dishwasher
  // detergent" first (rules are first-match-wins, in list order).
  { pattern: /\bdishwasher\s*pod[s]?|\bdishwasher\s*tablet[s]?/, emoji: '🍽️' },
  { pattern: /\bdishwasher\s*detergent|\bdishwasher\s*soap/, emoji: '🍽️' },
  { pattern: /\brinse\s*aid/, emoji: '🍽️' },
  { pattern: /\bdishwasher\b/, emoji: '🍽️' },
  // Laundry
  { pattern: /\bdryer\s*sheet/, emoji: '🌬️' },
  { pattern: /\bfabric\s*softener/, emoji: '🧴' },
  { pattern: /\bstain\s*remover/, emoji: '🧴' },
  { pattern: /\blaundry\s*detergent|\bdetergent\b/, emoji: '🧴' },
  { pattern: /\blaundry\s*pod[s]?\b/, emoji: '🧴' },
  { pattern: /\biron(?:ing)?\b/, emoji: '🧺' },
  { pattern: /\bclothespin|\bhanger[s]?\b/, emoji: '🧺' },
  { pattern: /\blaundry\b/, emoji: '🧺' },
  // Oven / bakeware
  { pattern: /\boven\s*mitt|\bpot\s*holder/, emoji: '🧤' },
  { pattern: /\boven\s*cleaner/, emoji: '🧴' },
  { pattern: /\bbaking\s*paper|\bparchment\s*paper/, emoji: '📄' },
  { pattern: /\boven\s*bag|\broasting\s*bag/, emoji: '🧻' },
  { pattern: /\boven\b/, emoji: '🍳' },
  // Dining table
  { pattern: /\btablecloth|\btable\s*runner/, emoji: '🍽️' },
  { pattern: /\bplacemat/, emoji: '🍽️' },
  { pattern: /\bcandle\s*holder|\bcenterpiece/, emoji: '🕯️' },
  { pattern: /\bcoaster[s]?\b/, emoji: '🍽️' },
  { pattern: /\bplatter|\bserving\s*dish/, emoji: '🍽️' },
  { pattern: /\bwine\s*glass|\bglassware/, emoji: '🍷' },
  { pattern: /\bsponge/, emoji: '🧽' },
  // These two must be checked before the generic \bcleaner\b fallback
  // right below, which would otherwise catch them first.
  { pattern: /\btoilet\s*bowl\s*cleaner/, emoji: '🚽' },
  { pattern: /\bdrain\s*cleaner|\bdrain\s*unclogger/, emoji: '🧪' },
  { pattern: /\bbleach|\bdisinfect|\bcleaner\b|\bcleaning\s*spray/, emoji: '🧴' },
  { pattern: /\btrash\s*bag|\bgarbage\s*bag/, emoji: '🗑️' },
  { pattern: /\baluminum\s*foil|\btin\s*foil/, emoji: '🧻' },
  { pattern: /\bplastic\s*wrap|\bcling\s*film/, emoji: '🧻' },
  { pattern: /\bziploc|\bfreezer\s*bag|\bsandwich\s*bag/, emoji: '🧊' },
  { pattern: /\bair\s*freshener|\bcandle\b/, emoji: '🕯️' },
  { pattern: /\blight\s*bulb/, emoji: '💡' },
  // Office & school supplies — generic \bpaper\b intentionally comes
  // AFTER every other paper-qualified rule above (toilet paper, paper
  // towel/plate/cup/bowl) so those more specific matches win first.
  { pattern: /\bpencil/, emoji: '✏️' },
  { pattern: /\bpen\b|\bballpoint/, emoji: '🖊️' },
  { pattern: /\bmarker|\bhighlighter/, emoji: '🖍️' },
  { pattern: /\bcrayon/, emoji: '🖍️' },
  { pattern: /\bnotebook|\bcomposition\s*book/, emoji: '📓' },
  { pattern: /\bfolder|\bbinder/, emoji: '📁' },
  { pattern: /\bscissors/, emoji: '✂️' },
  { pattern: /\bglue\b|\bglue\s*stick/, emoji: '🖇️' },
  { pattern: /\btape\b/, emoji: '📏' },
  { pattern: /\bruler/, emoji: '📏' },
  { pattern: /\bstapler|\bstaples\b/, emoji: '📎' },
  { pattern: /\bbackpack|\bbookbag/, emoji: '🎒' },
  { pattern: /\bcalculator/, emoji: '🧮' },
  { pattern: /\bindex\s*card|\bflash\s*card/, emoji: '🗂️' },
  { pattern: /\bsticky\s*note|\bpost-?it/, emoji: '🗒️' },
  { pattern: /\bpaper\s*clip/, emoji: '📎' },
  { pattern: /\brubber\s*band/, emoji: '📎' },
  { pattern: /\benvelope/, emoji: '✉️' },
  { pattern: /\bstamp[s]?\b(?!\s*duty)/, emoji: '✉️' },
  { pattern: /\blabel[s]?\b/, emoji: '🏷️' },
  { pattern: /\bwhiteboard|\bdry\s*erase/, emoji: '📋' },
  { pattern: /\bink\b|\bprinter\s*cartridge|\btoner/, emoji: '🖨️' },
  { pattern: /\bprinter\s*paper|\bcopy\s*paper/, emoji: '📄' },
  { pattern: /\bpaper\b/, emoji: '📄' },
  // Puja / religious supplies
  { pattern: /\bagarbatti|\bincense/, emoji: '🕉️' },
  { pattern: /\bcamphor|\bkapoor/, emoji: '🕉️' },
  { pattern: /\bdiya\b|\boil\s*lamp/, emoji: '🪔' },
  { pattern: /\bkumkum|\bsindoor|\bhaldi\b(?!\s*powder)/, emoji: '🕉️' },
  { pattern: /\bpuja\b|\bpooja\b/, emoji: '🕉️' },
  { pattern: /\bcotton\s*wick|\bbatti\b/, emoji: '🪔' },
  { pattern: /\bcoconut\b(?!\s*oil|\s*water|\s*milk)/, emoji: '🥥' },
  // Bathroom / plumbing
  { pattern: /\bshower\s*curtain|\bshower\s*head/, emoji: '🚿' },
  { pattern: /\bbath\s*mat|\bbathroom\s*rug/, emoji: '🛁' },
  { pattern: /\bfaucet|\btap\b/, emoji: '🚰' },
  { pattern: /\bsink\b/, emoji: '🚰' },
  { pattern: /\bplunger/, emoji: '🚽' },
  { pattern: /\btoilet\s*brush/, emoji: '🚽' },
  { pattern: /\btoilet\b(?!\s*paper)/, emoji: '🚽' },
  { pattern: /\bbathtub|\bbath\s*tub/, emoji: '🛁' },
  { pattern: /\bshower\b/, emoji: '🚿' },
  { pattern: /\bgrout|\bcaulk/, emoji: '🛠️' },
  // Personal care / health / beauty
  { pattern: /\bshampoo|\bconditioner/, emoji: '🧴' },
  { pattern: /\btoothpaste|\btoothbrush|\bmouthwash|\bfloss/, emoji: '🪥' },
  { pattern: /\bdeodorant/, emoji: '🧴' },
  { pattern: /\brazor|\bshaving\s*cream/, emoji: '🪒' },
  { pattern: /\blotion|\bmoisturizer|\bsunscreen/, emoji: '🧴' },
  { pattern: /\bmakeup|\bcosmetic/, emoji: '💄' },
  { pattern: /\blipstick|\blip\s*balm|\bchapstick/, emoji: '💄' },
  { pattern: /\bmascara|\beyeliner|\beyeshadow/, emoji: '💄' },
  { pattern: /\bnail\s*polish|\bmanicure/, emoji: '💅' },
  { pattern: /\bperfume|\bcologne|\bfragrance/, emoji: '🌸' },
  { pattern: /\bhair\s*brush|\bhairbrush|\bcomb\b/, emoji: '💇' },
  { pattern: /\bhair\s*spray|\bhair\s*gel|\bhair\s*dye/, emoji: '💇' },
  { pattern: /\bface\s*wash|\bfacial|\bskincare/, emoji: '🧴' },
  { pattern: /\bcotton\s*ball|\bcotton\s*swab|\bq-?tip/, emoji: '🧴' },
  { pattern: /\bband-?aid|\bbandage/, emoji: '🩹' },
  { pattern: /\bvitamin|\bsupplement/, emoji: '💊' },
  { pattern: /\bmedicine|\bmedication|\bpain\s*reliever|\bibuprofen|\btylenol|\badvil/, emoji: '💊' },
  { pattern: /\bfeminine|\bpad[s]?\b|\btampon/, emoji: '🩹' },
  { pattern: /\bdiaper/, emoji: '🍼' },
  { pattern: /\bwipe[s]?\b|\bbaby\s*wipe/, emoji: '🧻' },
  { pattern: /\bformula\b|\bbaby\s*food/, emoji: '🍼' },
  { pattern: /\bbattery|\bbatteries/, emoji: '🔋' },
  // Clothing
  { pattern: /\bshirt|\bt-shirt/, emoji: '👕' },
  { pattern: /\bsock/, emoji: '🧦' },
  { pattern: /\bshoe|\bsneaker/, emoji: '👟' },
  { pattern: /\bjacket|\bcoat\b/, emoji: '🧥' },
  { pattern: /\bpants|\bjeans/, emoji: '👖' },
  { pattern: /\bhat\b|\bcap\b/, emoji: '🧢' },
  // Pets
  { pattern: /\bdog\s*food|\bcat\s*food|\bpet\s*food/, emoji: '🐾' },
  { pattern: /\blitter\b/, emoji: '🐾' },
  { pattern: /\bleash|\bcollar/, emoji: '🐾' },
  // Flowers / plants
  { pattern: /\brose[s]?\b/, emoji: '🌹' },
  { pattern: /\btulip/, emoji: '🌷' },
  { pattern: /\bsunflower[s]?\b(?!\s*oil)/, emoji: '🌻' },
  { pattern: /\bdaisy|\bdaisies/, emoji: '🌼' },
  { pattern: /\bhibiscus/, emoji: '🌺' },
  { pattern: /\borchid/, emoji: '🌸' },
  // "flower pot" must be checked before the generic "flower" rule below
  // matches it first (rules are first-match-wins, in list order).
  { pattern: /\bflower\s*pot/, emoji: '🪴' },
  { pattern: /\bbouquet|\bflower[s]?\b/, emoji: '💐' },
  { pattern: /\bplant\b|\bhouseplant/, emoji: '🪴' },
  // Garden supplies
  { pattern: /\bsoil\b|\bpotting\s*mix|\bcompost/, emoji: '🪴' },
  { pattern: /\bfertilizer/, emoji: '🌱' },
  { pattern: /\bseed[s]?\b(?!less)/, emoji: '🌱' },
  { pattern: /\bmulch/, emoji: '🪵' },
  { pattern: /\bgarden\s*hose|\bhose\b/, emoji: '🚿' },
  { pattern: /\bgarden\s*glove|\bgardening\s*glove/, emoji: '🧤' },
  { pattern: /\btrowel|\bshovel|\brake\b|\bpruning\s*shear|\bgarden\s*tool/, emoji: '🛠️' },
  { pattern: /\bwatering\s*can/, emoji: '🪣' },
  { pattern: /\bplant\s*pot|\bflower\s*pot|\bplanter\b/, emoji: '🪴' },
  { pattern: /\bweed\s*killer|\bherbicide|\bpesticide|\binsecticide/, emoji: '🧪' },
  // Garage / hardware / tools
  { pattern: /\bhammer\b/, emoji: '🔨' },
  { pattern: /\bscrewdriver|\bwrench|\bpliers/, emoji: '🔧' },
  { pattern: /\bdrill\b/, emoji: '🪛' },
  { pattern: /\bscrew[s]?\b|\bnail[s]?\b(?!\s*polish)|\bbolt[s]?\b/, emoji: '🔩' },
  { pattern: /\bduct\s*tape/, emoji: '🧻' },
  { pattern: /\bextension\s*cord|\bcable\b/, emoji: '🔌' },
  { pattern: /\bcar\s*wash|\bcar\s*wax/, emoji: '🚗' },
  { pattern: /\bwindshield\s*wiper|\bwiper\s*fluid/, emoji: '🚗' },
  { pattern: /\btire\b|\btyre\b/, emoji: '🛞' },
  { pattern: /\bjumper\s*cable|\bcar\s*battery/, emoji: '🔋' },
  { pattern: /\bpropane|\bgas\s*can/, emoji: '🛢️' },
  { pattern: /\bpadlock|\block\b/, emoji: '🔒' },
  { pattern: /\bladder\b/, emoji: '🪜' },
  { pattern: /\bbroom\b/, emoji: '🧹' },
  { pattern: /\bwd-?40|\blubricant/, emoji: '🛢️' },
  { pattern: /\bsandpaper/, emoji: '🧻' },
  { pattern: /\bpaint\b(?!brush)/, emoji: '🎨' },
  { pattern: /\bpaintbrush|\bpaint\s*brush/, emoji: '🖌️' },
  // Home / hardware / other common shopping items
  { pattern: /\btowel\b(?!.*paper)/, emoji: '🧻' },
  { pattern: /\bpillow/, emoji: '🛏️' },
  { pattern: /\bsheet[s]?\b/, emoji: '🛏️' },
  { pattern: /\bcup[s]?\b|\bmug\b/, emoji: '☕' },
  { pattern: /\bplate[s]?\b|\bbowl[s]?\b/, emoji: '🍽️' },
  { pattern: /\bknife|\bknives/, emoji: '🔪' },
  { pattern: /\bfork|\bspoon|\bcutlery|\bsilverware|\bflatware|\bchopstick/, emoji: '🍴' },
  { pattern: /\bgift\s*card|\bgift\s*wrap/, emoji: '🎁' },
  { pattern: /\bbirthday\s*card|\bgreeting\s*card/, emoji: '💌' },
  { pattern: /\btoy\b/, emoji: '🧸' },
];

// Cached per-name lookup — the rule list is checked in order and the
// pattern.test() is cheap, but memoizing avoids re-scanning the whole list
// on every re-render for a list that doesn't change item names often.
const itemEmojiCache = new Map<string, string | null>();

export function itemEmoji(name: string | undefined | null): string | null {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (itemEmojiCache.has(key)) return itemEmojiCache.get(key)!;
  const match = ITEM_EMOJI_RULES.find(r => r.pattern.test(key));
  const result = match?.emoji ?? null;
  itemEmojiCache.set(key, result);
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000)   return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function catDotColor(colors: any): Record<string, string> {
  return {
    Produce: colors.teal, Dairy: colors.teal, Meat: colors.teal, Frozen: colors.teal,
    Grains: colors.amber, Snacks: colors.amber, Beverages: colors.amber,
    Cleaning: colors.primary, 'Personal Care': colors.primary, Spices: colors.primary,
    Other: colors.textTertiary,
  };
}

export function fmtProvenance(item: GroceryItem, members: any[]) {
  const time = new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateStr = fmtDate(item.createdAt);
  if (item.aiGenerated) return `Added by ✨ AI · ${dateStr} ${time}`;
  const member = members.find(m => m.id === item.addedBy);
  const name   = member?.name?.split(' ')[0] ?? 'Someone';
  return `Added by ${name} · ${dateStr}`;
}

export function mapBoughtRow(r: any): GroceryItem {
  return {
    id: r.id, familyId: r.family_id, name: r.name,
    quantity: r.quantity ?? undefined, category: r.category ?? undefined,
    storePreference: r.store_preference ?? undefined, notes: r.notes ?? undefined,
    addedBy: r.added_by ?? '', isBought: true,
    boughtBy: r.bought_by ?? undefined, boughtAt: r.bought_at ?? undefined,
    estimatedPrice: r.estimated_price ?? undefined, aiGenerated: r.ai_generated ?? false,
    createdAt: r.created_at,
  } as GroceryItem;
}

// ─── Quick-add suggestions ──────────────────────────────────────────────────

export const QUICK_SUGGESTIONS = [
  { name: 'Milk',     cat: 'Dairy',    emoji: '🥛' },
  { name: 'Eggs',     cat: 'Dairy',    emoji: '🥚' },
  { name: 'Bread',    cat: 'Bakery',   emoji: '🍞' },
  { name: 'Rice',     cat: 'Grains',   emoji: '🍚' },
  { name: 'Onion',    cat: 'Produce',  emoji: '🧅' },
  { name: 'Tomato',   cat: 'Produce',  emoji: '🍅' },
  { name: 'Banana',   cat: 'Produce',  emoji: '🍌' },
  { name: 'Butter',   cat: 'Dairy',    emoji: '🧈' },
  { name: 'Chicken',  cat: 'Meat',     emoji: '🍗' },
  { name: 'Pasta',    cat: 'Grains',   emoji: '🍝' },
  { name: 'Salt',     cat: 'Spices',   emoji: '🧂' },
  { name: 'Oil',      cat: 'Other',    emoji: '🫙' },
  { name: 'Water',    cat: 'Beverages',emoji: '💧' },
  { name: 'Coffee',   cat: 'Beverages',emoji: '☕' },
];

export interface AiSuggestedItem {
  name: string;
  quantity?: string;
  category?: string;
  storePreference?: string;
  notes?: string;
  isDuplicate?: boolean;
}

export const AI_QUICK_PROMPTS = ['Weekly staples', 'Healthy breakfast', 'School lunch', 'Weekend BBQ', 'Party for 12', 'Sunday cooking'];
