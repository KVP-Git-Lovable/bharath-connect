import LeavePolicyConfig from './LeavePolicyConfig';
import RegularizationPolicyConfig from './RegularizationPolicyConfig';

const AttendancePolicyConfig = () => {
  return (
    <div className="space-y-6">
      <LeavePolicyConfig />
      <RegularizationPolicyConfig />
    </div>
  );
};

export default AttendancePolicyConfig;
