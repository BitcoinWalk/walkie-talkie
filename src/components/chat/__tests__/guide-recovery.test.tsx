import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {BitcoinWalkGuideNotice} from '../BitcoinWalkGuideNotice';
import {dmService} from '@/services/dm/dm.service';

let mockAccount:string|null='account-a';
let mockDark=false;
jest.mock('lucide-react-native/icons/refresh-cw',()=>({__esModule:true,default:'MockRefreshIcon'}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
jest.mock('@/stores/active-account.store',()=>({useActiveAccount:(select:(state:{activePubkey:string|null})=>unknown)=>select({activePubkey:mockAccount})}));
jest.mock('@/services/dm/dm.service',()=>({dmService:{getAccountPubkey:jest.fn(()=>mockAccount),recoverStandardInbox:jest.fn()}}));
jest.mock('@/components/common/AppText',()=>({AppText:'MockText'}));
jest.mock('@/components/common/IconButton',()=>({IconButton:'MockButton'}));
jest.mock('@/theme',()=>({spacing:{lg:16,sm:8},uiDensity:{chatNoticeVerticalPadding:8,headerActionIconSize:20},iconStrokeWidth:{default:2},useThemeColors:()=>({textMuted:mockDark?'dark-muted':'light-muted',surfaceElevated:mockDark?'dark-surface':'light-surface',border:'theme-border'})}));

let view:ReactTestRenderer;
beforeEach(()=>{jest.clearAllMocks();mockAccount='account-a';mockDark=false;});
afterEach(()=>{if(view)act(()=>view.unmount());});

it.each([false,true])('is explicit, disabled while opening and themed (dark=%s)',async dark=>{
 mockDark=dark;
 let done!:(value:{checked:number;recovered:number})=>void;
 jest.mocked(dmService.recoverStandardInbox).mockReturnValue(new Promise(resolve=>{done=resolve;}));
 act(()=>{view=create(<BitcoinWalkGuideNotice message="notice"/>);});
 expect(dmService.recoverStandardInbox).not.toHaveBeenCalled();
 const button=()=>view.root.findByType('MockButton' as never);
 expect(button().props.icon.props.color).toBe(dark?'dark-muted':'light-muted');
 act(()=>button().props.onPress());
 expect(button().props.disabled).toBe(true);
 expect(view.root.findByType('MockText' as never).props.children).toContain('community.guide_recovery_opening');
 await act(async()=>{done({checked:1,recovered:1});await Promise.resolve();});
 expect(button().props.disabled).toBe(false);
 expect(view.root.findByType('MockText' as never).props.children).toContain('community.guide_recovery_done');
 mockAccount='account-b';
 act(()=>view.update(<BitcoinWalkGuideNotice message="new account notice"/>));
 expect(view.root.findByType('MockText' as never).props.children).not.toContain('community.guide_recovery_done');
});

it('retains a retry action after failure without pretending it opened messages',async()=>{
 jest.mocked(dmService.recoverStandardInbox).mockRejectedValue(new Error('unavailable'));
 act(()=>{view=create(<BitcoinWalkGuideNotice message="notice"/>);});
 await act(async()=>{view.root.findByType('MockButton' as never).props.onPress();await Promise.resolve();});
 expect(view.root.findByType('MockText' as never).props.children).toContain('community.guide_recovery_failed');
 expect(view.root.findByType('MockButton' as never).props.disabled).toBe(false);
});
