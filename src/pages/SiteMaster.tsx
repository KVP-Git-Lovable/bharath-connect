import { motion } from "framer-motion";
import SiteMasterManagement from "@/components/admin/SiteMasterManagement";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function SiteMasterPage() {
  return (
    <motion.div
      className="p-4 space-y-6 max-w-6xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold">Projects / Sites</h1>
        <p className="text-sm text-muted-foreground">Manage project sites for activity logging</p>
      </motion.div>

      <motion.div variants={item}>
        <SiteMasterManagement />
      </motion.div>
    </motion.div>
  );
}
