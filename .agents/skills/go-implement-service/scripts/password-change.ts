/** 为首次装配的账号服务增加乐观并发保护，保留找回的验证码事务。 */
export function completePasswordChange(files: Map<string, string>): void {
  const name = "internal/service/account.go"
  const source = files.get(name)
  const before = "if err := s.accounts.UpdatePassword(ctx, id, hashed); err != nil {"
  if (!source || source.split(before).length !== 2) throw new Error("改密模板锚点已变化：" + name)
  files.set(
    name,
    source.replace(
      before,
      `changed, err := s.accounts.CompareAndSwapPassword(ctx, account.ID, account.Password, account.TokenVersion, hashed)
  if err == nil && !changed { return apperr.ErrAccountPasswordMismatch }
  if err != nil {`
    )
  )
  const repository = "internal/repository/account.go"
  const value = files.get(repository)
  if (!value) throw new Error("账号仓储模板缺失")
  files.set(
    repository,
    value +
      `
// CompareAndSwapPassword 防止并发改密及读取后的退出被旧快照覆盖。
func (r *AccountRepository) CompareAndSwapPassword(ctx context.Context, id model.ID, expectedHash string, expectedVersion int64, nextHash string) (bool, error) {
  affected, err := r.UpdateBy(ctx, map[string]any{
    "password": nextHash,
    "token_version": gorm.Expr("token_version + 1"),
  }, WhereID(id), WhereEq("password", expectedHash), WhereEq("token_version", expectedVersion))
  return affected == 1, err
}
`
  )
}
