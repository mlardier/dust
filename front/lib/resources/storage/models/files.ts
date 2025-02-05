import type {
  FileStatus,
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
} from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";

export class FileModel extends Model<
  InferAttributes<FileModel>,
  InferCreationAttributes<FileModel>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;

  declare contentType: SupportedFileContentType;
  declare fileName: string;
  declare fileSize: number;
  declare status: FileStatus;
  declare useCase: FileUseCase;
  declare useCaseMetadata: FileUseCaseMetadata | null;
  declare snippet: string | null;

  declare userId: ForeignKey<User["id"]> | null;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare user: NonAttribute<User>;
}
FileModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    contentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useCase: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    useCaseMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    snippet: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "files",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId", "id"] }],
  }
);
Workspace.hasMany(FileModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
User.hasMany(FileModel, {
  foreignKey: { allowNull: true },
  onDelete: "RESTRICT",
});
FileModel.belongsTo(User);
