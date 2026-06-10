import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  UploadCloud,
  BookOpen,
  Settings,
  Plus,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { PIPELINE_STAGES } from "@/lib/pipeline";
import { usePipeline } from "@/store/PipelineContext";
import { cn } from "@/lib/utils";

function NavItem({
  to,
  icon: Icon,
  label,
  locked = false,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  locked?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-gray-100 text-gray-900"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        )
      }
    >
      <Icon size={18} className="shrink-0 text-gray-400 group-hover:text-gray-600" />
      <span className="truncate">{label}</span>
      {locked && <Lock size={13} className="ml-auto text-gray-300" />}
    </NavLink>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const { reset } = usePipeline();

  const newPipeline = () => {
    reset();
    navigate("/upload");
  };

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-base font-bold text-white">
          M
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-gray-900">Metafore</div>
          <div className="eyebrow text-[9px] font-semibold text-gray-400">
            Knowledge Graph
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <NavItem to="/" icon={LayoutDashboard} label="Overview" />
        <NavItem to="/upload" icon={UploadCloud} label="Upload Metadata" />

        <div className="px-3 pb-1 pt-4">
          <span className="eyebrow text-[9px] font-semibold text-gray-400">
            Pipeline Stages
          </span>
        </div>

        {PIPELINE_STAGES.map((stage) => (
          <NavItem
            key={stage.id}
            to={stage.route}
            icon={stage.icon as LucideIcon}
            label={`${stage.number}. ${stage.short}`}
            locked={!stage.implemented}
          />
        ))}
      </nav>

      <div className="space-y-1 border-t border-gray-200 px-3 py-3">
        <NavItem to="/docs" icon={BookOpen} label="Documentation" />
        <NavItem to="/settings" icon={Settings} label="Settings" />
      </div>

      <div className="px-3 pb-4">
        <button
          onClick={newPipeline}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-800"
        >
          <Plus size={16} />
          New Pipeline
        </button>
      </div>
    </aside>
  );
}
