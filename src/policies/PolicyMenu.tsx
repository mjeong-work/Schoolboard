import { Info } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { POLICIES } from './policyRoutes';
import { NEW_TAB } from './PolicyLinks';

// Kept out of PolicyLinks so App's footer import doesn't pull the dropdown
// into the login bundle.
/** Info icon in the desktop nav bar that opens the policy list. */
export function PolicyMenu() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Policies and guidelines"
        title="Policies and guidelines"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-[#666] hover:text-[#111] hover:bg-[#f5f5f5] transition-colors"
      >
        <Info className="w-4 h-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 font-[Roboto]">
        <DropdownMenuLabel className="text-xs text-[#999] font-normal">Policies &amp; guidelines</DropdownMenuLabel>
        {POLICIES.map((p) => (
          <DropdownMenuItem key={p.slug} asChild>
            <a href={p.path} {...NEW_TAB} className="cursor-pointer">
              {p.title}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
